/**
 * @file bin/sync-spotify.mjs
 * @author Daniele Bellavista
 */

import {readFile} from 'node:fs/promises';
import bunyan from 'bunyan';

const logger = bunyan.createLogger({
  name: 'main',
  serializers: bunyan.stdSerializers,
});

/**
 *
 */
async function main() {
  const work = JSON.parse(
    (await readFile('./data/work-to-do.json')).toString()
  );

  if (process.argv[2] === 'artists') {
    for (const artist of work.manualArtists) {
      logger.info({artist});
    }
  } else if (process.argv[2] === 'albums') {
    for (const album of work.manualAlbums) {
      logger.info({album});
    }
  } else if (process.argv[2] === 'tracks') {
    for (const track of work.manualTracks) {
      logger.info({track});
    }
  } else if (process.argv[2] === 'playlists') {
    if (!process.argv[3]) {
      logger.info({
        playlists: work.manualPlaylists.map((p) => ({
          name: p.name,
          count: p.tracks.length,
        })),
      });
    } else {
      const play = work.manualPlaylists.find((p) => p.name === process.argv[3]);
      for (const track of play.tracks) {
        logger.info({playlist: play.name, track});
      }
    }
  }
}

main().catch((err) => {
  logger.error({err}, 'Error');
  process.exit(1);
});
