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
  #protonmail;
  #onReading;
  #onUnknown;

  constructor(protonmail, onReading, onUnknown) {
    this.#protonmail = protonmail;
    this.#onReading = onReading;
    this.#onUnknown = onUnknown;
  }

  async task() {
    let allDone = false;
    for (let page = 0; !allDone; page++) {
      const {conversations} = await this.#protonmail.getConversations({
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
        await this.#protonmail.getConversation(conversation);
        const readings = [];

        for (const message of conversation.messages) {
          if (!message.unread) {
            continue;
          }
          let parsed = false;
          await this.#protonmail.getMessageBody(message);
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
              await this.#onReading(links);
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
              const description = he.decode(link.text().trim());
              parsed = true;
              await this.#onReading([
                {
                  url,
                  title: message.subject,
                  description,
                },
              ]);
            }
          } else if (message.sender.address === 'updates@academia-mail.com') {
            const link = $(
                'a[href*="/resource/work/*email_work_card=title"]',
            ).first();
            if (link) {
              const url = link.attr('href');
              const title = he.decode(link.text().trim());
              parsed = true;
              await this.#onReading([
                {
                  url,
                  title,
                  description: '',
                },
              ]);
            }
          } else if (message.sender.address === 'recommendations@ted.com') {
            const link = $('a[href*="explore.ted.com/watch/"]').first();
            if (link) {
              const url = link.attr('href');
              const title = he.decode(link.text().trim());
              const description = he.decode(
                  $(link)
                      .parent()
                      .text()
                      .trim(),
              );
              parsed = true;
              await this.#onReading([
                {
                  url,
                  title,
                  description,
                },
              ]);
            }
          }
          if (parsed) {
            await this.#protonmail.markAsRead(message);
          } else {
            await this.#onUnknown({
              sender: message.sender,
              subject: message.subject,
              body: message.decryptedBody,
            });
          }
        }

        await this.#onReading(readings);
      }
    }
  }
}

module.exports = ReadingInfoGetter;
