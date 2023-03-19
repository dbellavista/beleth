/**
 * @file protonmail.js
 * @module lib/protonmail
 * @author Daniele Bellavista
 */
'use strict';

const puppeteer = require('puppeteer');
const prompt = require('prompt');

const DEFAULTFOLDERS = [
  {ID: '0', Name: 'inbox'},
  {ID: '3', Name: 'trash'},
  {ID: '4', Name: 'spam'},
  {ID: '5', Name: 'all'},
  {ID: '6', Name: 'archive'},
  {ID: '7', Name: 'sent'},
  {ID: '8', Name: 'drafts'},
];

class Label {
  constructor({
    ID,
    Name,
    Color = null,
    Order = 0,
    Notify = false,
    Path = '',
    Type = 1,
    Display = true,
    Exclusive = true,
  }) {
    /** @type {string} */
    this.id = ID;
    /** @type {string} */
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
  constructor({Address, Name}) {
    this.address = Address;
    this.name = Name;
  }
}

class Count {
  constructor() {
    this.unread = 0;
    this.total = 0;
    this.attachments = 0;
    this.size = 0;
    this.time = new Date(0);
  }
}

class Conversation {
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

    this.messages = new Count();
    this.context = new Count();
    this.labels = new Map();

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

    this.count = new Count();

    this.count.time = new Date(originalMessage.Time);
    this.count.size = originalMessage.Size;
    this.count.attachments = originalMessage.NumAttachments;

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
 *
 * @access public
 */
class ProtonMail {
  /**
   * @class
   * @param {object} opts opts
   * @param {string} opts.user User
   * @param {string} opts.password Password
   * @param {boolean} opts.twofa Password
   */
  constructor({user, password, twofa}) {
    this._user = user;
    this._password = password;
    this._twofa = twofa;
    /** @type {puppeteer.Browser} */
    this._browser;
    /** @type {puppeteer.Page} */
    this._page;

    /** @type {Map<string, Label|Folder>} */
    this._foldersAndLabelsMap = new Map();
    /** @type {Array<Label|Folder>} */
    this._allFoldersAndLabels = [];
  }

  async _init() {
    if (!this._browser) {
      this._browser = await puppeteer.launch();
    }
    if (!this._page) {
      this._page = await this._browser.newPage();
    }
  }

  async _perform2FA() {
    await this._page.waitForSelector('#login_btn_2fa');

    prompt.start();
    const passcode = await new Promise((resolve, reject) => {
      prompt.get(['passcode'], (err, result) =>
        err ? reject(err) : resolve(result.passcode)
      );
    });
    await this._page.type('#twoFactorCode', passcode);
    await this._page.click('#login_btn_2fa');
  }

  async login() {
    await this._init();
    await this._page.goto('https://mail.protonmail.com/login');
    await this._page.waitForSelector('#login_btn');
    await this._page.type('#username', this._user);
    await this._page.type('#password', this._password);
    await this._page.click('#login_btn');
    await this._page.waitForTimeout(5000);
    if (this._twofa) {
      await this._perform2FA();
    }
    await this._page.waitForSelector('#ptSidebar');

    const {labels, folders} = await this._page.evaluate(() => {
      const win = /** @type {any} */ (window);
      /* eslint-env browser */
      const labels = win.angular
        .element(document.body)
        .injector()
        .get('labelsModel');
      win.MessageModel = win.angular
        .element(document.body)
        .injector()
        .get('messageModel');
      win.conversationApi = win.angular
        .element(document.body)
        .injector()
        .get('conversationApi');
      win.messageApi = win.angular
        .element(document.body)
        .injector()
        .get('messageApi');
      return {
        folders: labels.get('folders'),
        labels: labels.get('labels'),
      };
      /* eslint-env es6,node */
    });
    this._foldersAndLabelsMap = new Map();
    for (const fobj of DEFAULTFOLDERS.concat(folders)) {
      const fold = new Folder(fobj);
      this._allFoldersAndLabels.push(fold);
      this._foldersAndLabelsMap.set(fold.id, fold);
      this._foldersAndLabelsMap.set(fold.name, fold);
    }
    for (const lobj of labels) {
      const label = new Label(lobj);
      this._allFoldersAndLabels.push(label);
      this._foldersAndLabelsMap.set(label.id, label);
      this._foldersAndLabelsMap.set(label.name, label);
    }
  }

  get labels() {
    return this._allFoldersAndLabels.map((obj) => ({
      id: obj.id,
      name: obj.name,
    }));
  }

  async getConversations({where, page = 0}) {
    if (!where) {
      where = 0;
    }
    const labelId = this._foldersAndLabelsMap.get(where).id;
    const result = await this._page.evaluate(
      async (LabelID, Page) => {
        const result = await /** @type {any} */ (window).conversationApi.query({
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
    const result = await this._page.evaluate(async (conversationId) => {
      const result = await /** @type {any} */ (window).conversationApi.get(
        conversationId
      );
      return result;
    }, conversation.id);
    conversation.messages = result.data.Messages.map((m) => new Message(m));
    return conversation;
  }

  async getMessageBody(message) {
    if (!message.body) {
      const result = await this._page.evaluate(async (messageId) => {
        const result = await /** @type {any} */ (window).messageApi.get(
          messageId
        );
        return result;
      }, message.id);
      message.setBody(result.data.Message.Body);
    }

    const data = await this._page.evaluate((originalMessage) => {
      const message = new /** @type {any} */ (window).MessageModel(
        originalMessage
      );
      return message.decryptBody();
    }, message.originalMessage);
    message.decryptedBody = data.message;

    return message;
  }

  async markAsRead(messages) {
    if (!Array.isArray(messages)) {
      messages = [messages];
    }
    await this._page.evaluate(
      async (IDs) => {
        await /** @type {any} */ (window).messageApi.read({IDs});
      },
      messages.map((m) => m.id)
    );
    for (const m of messages) {
      m.unread = false;
    }
  }

  async logout() {
    await this._browser.close();
    this._page = null;
    this._browser = null;
  }
}

module.exports = {ProtonMail};
