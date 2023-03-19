/**
 * @file bin/sync-spotify.mjs
 * @author Daniele Bellavista
 */

import {readFile} from 'node:fs/promises';
import bunyan from 'bunyan';
import {configuration} from '../lib/configuration.mjs';
import {Spotify} from '../lib/interfaces/spotify.mjs';

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
  const spotify = new Spotify(configuration.spotify);

  logger.info('Following artists');
  for (let i = 0; i < work.artists.length; i += 50) {
    await spotify.followArtists(work.artists.slice(i, i + 50));
  }

  logger.info('Saving albums');
  for (let i = 0; i < work.albums.length; i += 50) {
    await spotify.saveAlbums(work.albums.slice(i, i + 50));
  }

  logger.info('Saving tracks');
  for (let i = 0; i < work.tracks.length; i += 50) {
    await spotify.saveTracks(work.tracks.slice(i, i + 50));
  }

  const playlists = await spotify.getPlaylists();

  for (const play of work.playlists) {
    let spoPlay = playlists.items.find((el) => el.name === play.name);
    if (!spoPlay) {
      spoPlay = await spotify.createPlaylist(play.name, '');
      logger.info({spoPlay: spoPlay.name}, 'New playlist created');
    }

    const allTracks = await spotify.getAllPaginated(spoPlay.tracks);
    const trackSet = new Set(allTracks.map((t) => t.uri));
    const tracksToAdd = play.tracks.filter((t) => !trackSet.has(t));
    logger.info(
      {playlist: spoPlay.name, tracks: tracksToAdd.length},
      'Adding to playlist'
    );
    for (let i = 0; i < tracksToAdd.length; i += 100) {
      await spotify.addTracksToPlaylist(
        spoPlay.id,
        tracksToAdd.slice(i, i + 100)
      );
    }
  }
}

main().catch((err) => {
  logger.error({err}, 'Error');
  process.exit(1);
});
