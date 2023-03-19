/**
 * @file bin/list-dezer.mjs
 * @author Daniele Bellavista
 */

import {configuration} from '../lib/configuration.mjs';
import {Deezer} from '../lib/interfaces/deezer.mjs';
import {writeFile} from 'node:fs/promises';

/**
 *
 */
async function main() {
  const deezer = new Deezer(configuration.deezer);

  await deezer.auth();
  const playlists = await deezer.getPlaylists();
  const favourites = await deezer.getFavourites();
  await writeFile(
    './data/deezer.json',
    JSON.stringify({playlists, favourites}, null, ' ')
  );
}

main();
