/**
 * @file index.js
 * @module protonmail-api/index
 * @author Daniele Bellavista
 */
'use strict';

const {ProtonMail} = require('./lib/protonmail');
const prompt = require('prompt');
const fsPromises = require('fs').promises;
const MusicLinkGetter = require('./lib/music-link-getter');
const ReadingInfoGetter = require('./lib/reading-info-getter');

/**
 *
 */
async function main() {
  const musicDest = await fsPromises.open(process.argv[2], 'wx');
  let readingDest;
  if (process.argv[3]) {
    readingDest = await fsPromises.open(process.argv[3], 'wx');
  }

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

  const mlinkGetter = new MusicLinkGetter(
    pm,
    async (links) => {
      if (links.length > 0) {
        await musicDest.write(Buffer.from(`${links.join('\n')}\n`));
      }
    },
    (info) => {
      console.log(JSON.stringify(info, null, ' '));
    }
  );
  await mlinkGetter.task();
  await musicDest.close();

  if (readingDest) {
    const rInfoGetter = new ReadingInfoGetter(
      pm,
      async (info) => {
        if (info.length === 0) {
          return;
        }
        const stringToWrite = info
          .map((ri) => {
            return `
${ri.title}
  ${ri.url}
  ${ri.description
    .replace(/\n/g, ' ')
    .replace(/(.{76}\S+)\s*/g, '$1\n')
    .replace(/\n/g, '\n  ')
    .trim()}`;
          })
          .join('\n');
        await readingDest.write(Buffer.from(stringToWrite + '\n\n'));
      },
      (info) => {
        console.log(JSON.stringify(info, null, ' '));
      }
    );
    try {
      await rInfoGetter.task();
    } catch (err) {}
    await readingDest.close();
  }
  await pm.logout();
}

main().then(null, (err) => {
  console.error(err);
  process.exit(1);
});
