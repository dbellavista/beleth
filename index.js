/**
 * @file index.js
 * @module protonmail-api/index
 * @author Daniele Bellavista
 * @version 0.0
 *
 */
'use strict';

const {ProtonMail} = require('./lib/protonmail');
const prompt = require('prompt');
const cheerio = require('cheerio');
const url = require('url');

async function main() {
  prompt.start();
  const {user, password} = await new Promise((resolve, reject) =>
    prompt.get(
        [
          {
            name: 'user',
            required: true,
          },
          {
            name: 'password',
            hidden: true,
          },
        ],
        (err, result) => (err ? reject(err) : resolve(result))
    )
  );
  const pm = new ProtonMail({
    user,
    password,
    twofa: true,
  });
  await pm.login();
  const newMusic = new Set();
  const addMusic = (music) => {
    if (!newMusic.has(music)) {
      newMusic.add(music);
      console.log(music);
    }
  };
  const {conversations} = await pm.getConversations({
    where: 'Media',
    page: 0,
  });
  for (const conversation of conversations) {
    if (conversation.messages.unread > 0) {
      await pm.getConversation(conversation);
      for (const message of conversation.messages) {
        if (!message.unread) {
          continue;
        }
        let parsed = false;
        await pm.getMessageBody(message);
        const $ = cheerio.load(message.decryptedBody);
        // TODO parse other
        if (message.sender.name === 'Bandcamp') {
          $('a[href*="bandcamp.com/album"],a[href*="bandcamp.com/track"]').each(
              function() {
                parsed = true;
                const el = $(this);
                const music = el.attr('href');
                const uobj = url.parse(music);
                delete uobj.search;
                delete uobj.hash;
                delete uobj.query;
                addMusic(url.format(uobj));
              }
          );
        } else if (message.sender.address === 'noreply@mixcloudmail.com') {
          if (message.subject === 'Weekly Update') {
            $('a').each(function() {
              const el = $(this);
              if (el.text() === 'Play All') {
                parsed = true;
                addMusic(el.attr('href'));
              }
            });
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

              $('a').each(function() {
                const el = $(this);
                links.push(el.text());
                if (
                  el
                      .text()
                      .toLowerCase()
                      .indexOf(title) >= 0
                ) {
                  addMusic(el.attr('href'));
                  found = true;
                }
              });
            } else {
              $('a').each(function() {
                const el = $(this);
                links.push(el.text());
              });
            }
            parsed = found;
            if (!found) {
              console.log(
                  JSON.stringify(
                      {
                        notFound: message.subject,
                        titlee,
                        links,
                      },
                      null,
                      ' '
                  )
              );
            }
          }
        } else {
          console.log(JSON.stringify(message, null, ' '));
        }
        if (parsed) {
          await pm.markAsRead(message);
        }
      }
    }
  }

  await pm.logout();
}

main();
