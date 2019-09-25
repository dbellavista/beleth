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
}

main();
