/**
 * @file bin/search-in-spotify.mjs
 * @author Daniele Bellavista
 */

import {configuration} from '../lib/configuration.mjs';
import {Spotify} from '../lib/interfaces/spotify.mjs';
import {readFile, writeFile} from 'node:fs/promises';
import bunyan from 'bunyan';

const logger = bunyan.createLogger({
  name: 'main',
  serializers: bunyan.stdSerializers,
});

/**
 *
 */
async function main() {
  const spotify = new Spotify(configuration.spotify);
  /** @type {{playlists: import('../lib/interfaces/deezer.mjs').PlaylistAndTracks[], favourites: import('../lib/interfaces/deezer.mjs').Favourites}} */
  const {playlists, favourites} = JSON.parse(
    (await readFile('./data/deezer.json')).toString()
  );
  const map = new Map();
  try {
    const res = JSON.parse(
      (await readFile('./data/spotify-tracks-mapping.json')).toString()
    );
    for (const r of res) {
      map.set(r.deezerId, r);
    }
  } catch (err) {}

  try {
    logger.info('Searching tracks');
    for (const track of favourites.tracks) {
      if (map.has(track.id)) {
        continue;
      }
      const query = `track:${track.title.slice(
        0,
        60
      )} artist:${track.artist.name.slice(
        0,
        60
      )} album:${track.album.title.slice(0, 60)}`;
      const res = await spotify.searchItem(query, ['track']);
      map.set(track.id, {
        deezerId: track.id,
        type: 'track',
        query: query,
        result: res,
      });
    }
    logger.info('Searching artists');
    for (const artist of favourites.artists) {
      if (map.has(artist.id)) {
        continue;
      }
      const query = `artist:${artist.name}`;
      const res = await spotify.searchItem(query, ['artist']);
      map.set(artist.id, {
        deezerId: artist.id,
        type: 'artist',
        query: query,
        result: res,
      });
    }
    logger.info('Searching albums');
    for (const album of favourites.albums) {
      if (map.has(album.id)) {
        continue;
      }
      const query = `album:${album.title.slice(
        0,
        60
      )} artist:${album.artist.name.slice(0, 60)}`;
      const res = await spotify.searchItem(query, ['album']);
      map.set(album.id, {
        deezerId: album.id,
        type: 'album',
        query: query,
        result: res,
      });
    }
    for (const playlist of playlists) {
      if (playlist.playlist.title === 'Loved Tracks') {
        continue;
      }
      logger.info(
        {playlist: playlist.playlist.title},
        'Searching playlist tracks'
      );
      for (const track of playlist.tracklist) {
        const existing = map.get(track.id);
        if (existing?.result.tracks.total > 0) {
          continue;
        }
        let query = `track:${track.title.slice(
          0,
          60
        )} artist:${track.artist.name.slice(
          0,
          60
        )} album:${track.album.title.slice(0, 60)}`;
        let res = await spotify.searchItem(query, ['track']);
        if (res.tracks.total === 0) {
          query = `track:${track.title.slice(
            0,
            60
          )} artist:${track.artist.name.slice(0, 60)}`;
          res = await spotify.searchItem(query, ['track']);
          if (res.tracks.total === 0) {
            query = `track:${track.title.slice(0, 60)}`;
            res = await spotify.searchItem(query, ['track']);
          }
        }
        map.set(track.id, {
          deezerId: track.id,
          type: 'track',
          query: query,
          result: res,
        });
      }
    }
  } finally {
    await writeFile(
      './data/spotify-tracks-mapping.json',
      JSON.stringify([...map.values()], null, ' ')
    );
  }
}

main();
