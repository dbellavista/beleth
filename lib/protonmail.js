/**
 * @file protonmail.js
 * @module lib/protonmail
 * @author Daniele Bellavista
 * @version 0.0
 *
 */
'use strict';

const puppeteer = require('puppeteer');
const prompt = require('prompt');

const DEFAULTFOLDERS = [
  {ID: 0, Name: 'inbox'},
  {ID: 3, Name: 'trash'},
  {ID: 4, Name: 'spam'},
  {ID: 5, Name: 'all'},
  {ID: 6, Name: 'archive'},
  {ID: 7, Name: 'sent'},
  {ID: 8, Name: 'drafts'},
];

class Label {
  id = '';
  name = '';
  order = 0;
  notify = false;
  path = '';
  type = 1;
  display = true;
  exclusive = true;

  constructor({
    ID,
    Name,
    Color,
    Order,
    Notify,
    Path,
    Type,
    Display,
    Exclusive,
  }) {
    this.id = ID;
    this.name = Name;
    this.order = Order;
    this.notify = !!Notify;
    this.path = Path;
    this.type = Type;
    this.display = !!Display;
    this.exclusive = !!Exclusive;
  }
}

class Folder extends Label {}

class Address {
  address = '';
  name = '';
  constructor({Address, Name}) {
    this.address = Address;
    this.name = Name;
  }
}

class Count {
  unread = 0;
  total = 0;
  attachments = 0;
  size = 0;
  time = new Date(0);
}

class Conversation {
  id = '';
  order = 0;
  subject = '';
  senders = [];
  recipients = [];
  messages = new Count();
  expirationTime = NaN;
  context = new Count();
  labels = new Map();

  messages = [];

  constructor({
    ID,
    Order,
    Subject,
    Senders,
    Recipients,
    NumMessages,
    NumUnread,
    NumAttachments,
    ExpirationTime,
    Size,
    ContextSize,
    ContextTime,
    Time,
    ContextNumMessages,
    ContextNumUnread,
    ContextNumAttachments,
    LabelIDs,
    Labels,
  }) {
    this.id = ID;
    this.order = Order;
    this.subject = Subject;
    this.senders = Senders.map((s) => new Address(s));
    this.recipients = Recipients.map((r) => new Address(r));
    this.messages.total = NumMessages;
    this.messages.unread = NumUnread;
    this.messages.attachments = NumAttachments;
    this.messages.size = Size;
    this.messages.time = new Date(Time);
    this.context.total = ContextNumMessages;
    this.context.unread = ContextNumUnread;
    this.context.attachments = ContextNumAttachments;
    this.context.size = ContextSize;
    this.context.time = new Date(ContextTime);
    this.expirationTime = new Date(ExpirationTime);
    for (const label of Labels) {
      const context = new Count();
      context.total = ContextNumMessages;
      context.unread = ContextNumUnread;
      context.attachments = ContextNumAttachments;
      context.size = ContextSize;
      this.labels.set(label.ID, context);
    }
  }
}

class Message {
  originalMessage = null;

  id = '';
  conversationId = '';
  subject = '';
  body = null;
  decryptedBody = null;
  unread = false;
  sender = null;
  flags = 0;
  type = 0;
  isEncrypted = false;
  isReplied = false;
  isRepliedAll = false;
  isForwarded = false;
  to = [];
  cc = [];
  bcc = [];
  count = new Count();
  addressId = '';
  starred = false;
  location = 0;
  labelIds = [];

  constructor(originalMessage) {
    this.originalMessage = originalMessage;

    this.id = originalMessage.ID;
    this.conversationID = originalMessage.ConversationID;
    this.subject = originalMessage.Subject;
    this.unread = originalMessage.Unread > 0;
    this.sender = new Address(originalMessage.Sender);
    this.flags = originalMessage.Flags;
    this.body = originalMessage.Body;
    this.type = originalMessage.Type;
    this.isEncrypted = originalMessage.IsEncrypted > 0;
    this.isReplied = originalMessage.IsReplied > 0;
    this.isRepliedAll = originalMessage.IsRepliedAll > 0;
    this.isForwarded = originalMessage.IsForwarded > 0;
    this.toList = originalMessage.ToList.map((a) => new Address(a));
    this.cCList = originalMessage.CCList.map((a) => new Address(a));
    this.bCCList = originalMessage.BCCList.map((a) => new Address(a));
    this.count.time = new Date(originalMessage.Time);
    this.count.size = originalMessage.Size;
    this.count.numAttachments = originalMessage.NumAttachments;
    this.expirationTime = new Date(originalMessage.ExpirationTime);
    this.addressID = originalMessage.AddressID;
    this.starred = originalMessage.Starred > 0;
    this.location = originalMessage.Location;
    this.labelIDs = originalMessage.LabelIDs;
  }

  setBody(body) {
    this.body = body;
    this.originalMessage.Body = body;
  }
}

/**
 * ProtonMail
 * @access public
 */
class ProtonMail {
  #user;
  #password;
  #twofa = false;

  #browser;
  #page;

  #foldersAndLabelsMap = new Map();
  #allFoldersAndLabels = [];

  /**
   * @constructor
   * @param {string} user User
   * @param {string} password Password
   * @return {undefined}
   */
  constructor({user, password, twofa}) {
    this.#user = user;
    this.#password = password;
    this.#twofa = twofa;
  }

  async _init() {
    if (!this.#browser) {
      this.#browser = await puppeteer.launch();
    }
    if (!this.#page) {
      this.#page = await this.#browser.newPage();
    }
  }

  async _perform2FA() {
    await this.#page.waitForSelector('#login_btn_2fa');

    prompt.start();
    const passcode = await new Promise((resolve, reject) => {
      prompt.get(['passcode'], (err, result) =>
        err ? reject(err) : resolve(result.passcode)
      );
    });
    await this.#page.type('#twoFactorCode', passcode);
    await this.#page.click('#login_btn_2fa');
  }

  async login() {
    await this._init();
    await this.#page.goto('https://mail.protonmail.com/login');
    await this.#page.waitForSelector('#login_btn');
    await this.#page.type('#username', this.#user);
    await this.#page.type('#password', this.#password);
    await this.#page.click('#login_btn');
    if (this.#twofa) {
      await this._perform2FA();
    }
    await this.#page.waitForSelector('#ptSidebar');

    const {labels, folders} = await this.#page.evaluate(() => {
      /* eslint-env browser */
      const labels = window.angular
          .element(document.body)
          .injector()
          .get('labelsModel');
      window.MessageModel = window.angular
          .element(document.body)
          .injector()
          .get('messageModel');
      window.conversationApi = window.angular
          .element(document.body)
          .injector()
          .get('conversationApi');
      window.messageApi = window.angular
          .element(document.body)
          .injector()
          .get('messageApi');
      return {
        folders: labels.get('folders'),
        labels: labels.get('labels'),
      };
      /* eslint-env es6,node */
    });
    this.#foldersAndLabelsMap = new Map(
        DEFAULTFOLDERS.concat(folders)
            .flatMap((fobj) => {
              const fold = new Folder(fobj);
              this.#allFoldersAndLabels.push(fold);
              return [[fold.id, fold], [fold.name, fold]];
            })
            .concat(
                labels.flatMap((lobj) => {
                  const label = new Label(lobj);
                  this.#allFoldersAndLabels.push(label);
                  return [[label.id, label], [label.name, label]];
                })
            )
    );
  }

  get labels() {
    return this.#allFoldersAndLabels.map((obj) => ({
      id: obj.id,
      name: obj.name,
    }));
  }

  async getConversations({where, page = 0}) {
    if (!where) {
      where = 0;
    }
    const labelId = this.#foldersAndLabelsMap.get(where).id;
    const result = await this.#page.evaluate(
        async (LabelID, Page) => {
          const result = await window.conversationApi.query({
            LabelID,
            Page,
            Limit: 100,
          });
          return result;
        },
        labelId,
        page
    );

    const conversations = result.data.Conversations.map(
        (conv) => new Conversation(conv)
    );

    return {
      total: result.data.Total,
      limit: result.data.Limit,
      conversations,
    };
  }

  async getConversation(conversation) {
    const result = await this.#page.evaluate(async (conversationId) => {
      const result = await window.conversationApi.get(conversationId);
      return result;
    }, conversation.id);
    conversation.messages = result.data.Messages.map((m) => new Message(m));
    return conversation;
  }

  async getMessageBody(message) {
    if (!message.body) {
      const result = await this.#page.evaluate(async (messageId) => {
        const result = await window.messageApi.get(messageId);
        return result;
      }, message.id);
      message.setBody(result.data.Message.Body);
    }

    const data = await this.#page.evaluate((originalMessage) => {
      const message = new window.MessageModel(originalMessage);
      return message.decryptBody();
    }, message.originalMessage);
    message.decryptedBody = data.message;

    return message;
  }

  async markAsRead(messages) {
    if (!Array.isArray(messages)) {
      messages = [messages];
    }
    await this.#page.evaluate(async (IDs) => {
      await window.messageApi.read({IDs});
    }, messages.map((m) => m.id));
    for (const m of messages) {
      m.unread = false;
    }
  }

  async logout() {
    await this.#browser.close();
    this.#page = null;
    this.#browser = null;
  }
}

module.exports = {ProtonMail};
