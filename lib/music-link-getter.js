/**
 * @file music-link-getter.js
 * @module lib/music-link-getter
 * @author Daniele Bellavista
 *
 */
'use strict';

const cheerio = require('cheerio');
const url = require('url');

class MusicLinkGetter {
  constructor(protonmail, onMusic, onUnknown) {
    this._protonmail = protonmail;
    this._onMusic = onMusic;
    this._onUnknown = onUnknown;
  }

  async task() {
    let allDone = false;
    const allMusic = new Set();
    const pushMusic = (musicToAdd, link) => {
      if (!allMusic.has(link)) {
        allMusic.add(link);
        musicToAdd.push(link);
      }
    };
    for (let page = 0; !allDone; page++) {
      const {conversations} = await this._protonmail.getConversations({
        where: 'Media',
        page,
      });
      if (conversations.length === 0) {
        allDone = true;
        continue;
      }
      for (const conversation of conversations) {
        if (conversation.messages.unread === 0) {
          continue;
        }
        await this._protonmail.getConversation(conversation);
        const musicToAdd = [];

        for (const message of conversation.messages) {
          if (!message.unread) {
            continue;
          }
          let parsed = false;
          await this._protonmail.getMessageBody(message);
          const $ = cheerio.load(message.decryptedBody);
          if (message.sender.name === 'Bandcamp') {
            $(
              [
                'a[href*=".org/album"]',
                '[href*=".com/album"]',
                'a[href*=".org/track"]',
                'a[href*=".com/track"]',
              ].join(',')
            ).each(function () {
              parsed = true;
              const el = $(this);
              const music = el.attr('href');
              const uobj = url.parse(music);
              delete uobj.search;
              delete uobj.hash;
              delete uobj.query;
              pushMusic(musicToAdd, url.format(uobj));
            });
            if (!parsed) {
              await this._onUnknown({
                subject: message.subject,
                body: message.decryptedBody,
              });
            }
          } else if (message.sender.address === 'noreply@mixcloudmail.com') {
            if (message.subject === 'Weekly Update') {
              $('a').each(function () {
                const el = $(this);
                if (el.text() === 'Play All') {
                  parsed = true;
                  pushMusic(musicToAdd, el.attr('href'));
                }
              });
            } else if (/left a message on your/.test(message.subject)) {
              parsed = true;
            } else {
              let found = false;
              const links = [];
              let titlee = /"(.*)" uploaded by/i.exec(message.subject);
              if (!titlee) {
                titlee = /is sharing exclusive shows - (.*) By /i.exec(
                  message.subject
                );
              }
              if (titlee) {
                const title = titlee[1].toLowerCase().slice(0, 50);

                $('a').each(function () {
                  const el = $(this);
                  links.push(el.text());
                  if (el.text().toLowerCase().indexOf(title) >= 0) {
                    pushMusic(musicToAdd, el.attr('href'));
                    found = true;
                  }
                });
              } else {
                $('a').each(function () {
                  const el = $(this);
                  links.push(el.text());
                });
              }
              parsed = found;
              if (
                !found &&
                !/sharing exclusive shows|^New Post/.test(message.subject)
              ) {
                await this._onUnknown({
                  subject: message.subject,
                  body: message.decryptedBody,
                  titlee,
                  links,
                });
              }
            }
          } else {
            await this._onUnknown({
              subject: message.subject,
              body: message.decryptedBody,
            });
          }
          if (parsed) {
            await this._protonmail.markAsRead(message);
          }
        }

        await this._onMusic(musicToAdd);
      }
    }
    return [...allMusic];
  }
}

module.exports = MusicLinkGetter;
