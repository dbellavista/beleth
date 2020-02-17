/**
 * @file reading-info-getter.js
 * @module lib/reading-info-getter
 * @author Daniele Bellavista
 * @version 0.0
 *
 */
'use strict';

const cheerio = require('cheerio');
const he = require('he');

class ReadingInfoGetter {
  constructor(protonmail, onReading, onUnknown) {
    this._protonmail = protonmail;
    this._onReading = onReading;
    this._onUnknown = onUnknown;
  }

  async task() {
    let allDone = false;
    for (let page = 0; !allDone; page++) {
      const {conversations} = await this._protonmail.getConversations({
        where: 'Readings',
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
        const readings = [];

        for (const message of conversation.messages) {
          if (!message.unread) {
            continue;
          }
          let parsed = false;
          await this._protonmail.getMessageBody(message);
          const $ = cheerio.load(message.decryptedBody);
          if (message.sender.address === 'busybee@blogtrottr.com') {
            const links = [];
            $('table.btrcontent').each(function() {
              parsed = true;
              const el = $(this);
              const url = el
                  .find('a')
                  .first()
                  .attr('href');
              if (url) {
                const title = he.decode(
                    el
                        .find('a')
                        .first()
                        .text()
                        .trim(),
                );
                const description =
                  he.decode(
                      el
                          .find('div')
                          .text()
                          .trim(),
                  ) || '';
                links.push({
                  title,
                  url,
                  description,
                });
              }
            });
            if (links.length > 0) {
              await this._onReading(links);
            }
          } else if (
            message.sender.address === 'info@renaissanceperiodization.com'
          ) {
            if (/save up to/i.test(message.subject)) {
              parsed = true;
            }
          } else if (message.sender.address === 'noreply@bandcamp.com') {
            const link = $('a[href*="daily.bandcamp.com/"]').first();
            if (link) {
              const url = link.attr('href');
              if (url) {
                const description = he.decode(link.text().trim());
                parsed = true;
                await this._onReading([
                  {
                    url,
                    title: message.subject,
                    description,
                  },
                ]);
              }
            }
          } else if (
            message.sender.address === 'info@philossophiainitiative.com'
          ) {
            const links = $('a[href*="/track/click"]');
            const extracted = [];
            const defDesc = he.decode(
                $('h3')
                    .first()
                    .text()
                    .trim()
                    .replace(/[\s\n]+/g, ' '),
            );
            links.each(function() {
              parsed = true;
              const link = $(this);
              const title = he.decode(
                  link
                      .text()
                      .trim()
                      .replace(/[\s\n]+/g, ' '),
              );
              if (title) {
                extracted.push({
                  url: link.attr('href'),
                  title,
                  description:
                    he
                        .decode(
                            link
                                .parent('span')
                                .text()
                                .trim()
                                .replace(/[\s\n]+/g, ' '),
                        )
                        .replace(title, '')
                        .trim() || defDesc,
                });
              }
            });
            await this._onReading(extracted);
          } else if (message.sender.address === 'updates@academia-mail.com') {
            const link = $(
                'a[href*="/resource/work/"][href*="email_work_card=title"]',
            ).first();
            if (link.length > 0) {
              const url = link.attr('href');
              const title = he.decode(link.text().trim());
              parsed = true;
              await this._onReading([
                {
                  url,
                  title,
                  description: '',
                },
              ]);
            }
          } else if (message.sender.address === 'recommendations@ted.com') {
            const link = $('a[href*="explore.ted.com/watch/"]').first();
            if (link.length > 0) {
              const url = link.attr('href');
              const title = he.decode(link.text().trim());
              const description = he.decode(
                  $(link)
                      .parent()
                      .text()
                      .trim(),
              );
              parsed = true;
              await this._onReading([
                {
                  url,
                  title,
                  description,
                },
              ]);
            }
          }
          if (parsed) {
            await this._protonmail.markAsRead(message);
          } else {
            await this._onUnknown({
              sender: message.sender,
              subject: message.subject,
              body: message.decryptedBody,
            });
          }
        }

        await this._onReading(readings);
      }
    }
  }
}

module.exports = ReadingInfoGetter;
