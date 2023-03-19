/**
 * @file bin/analyze-spotify-mappings.js
 * @author Daniele Bellavista
 */

import {readFile, writeFile} from 'node:fs/promises';
import bunyan from 'bunyan';

const logger = bunyan.createLogger({
  name: 'main',
  serializers: bunyan.stdSerializers,
});

/**
 *
 * @param {any[]} ok
 * @param {any[]} manual
 * @param {any} track
 * @param {any} el
 * @param {boolean} idOrUri
 * @returns {void}
 */
function matchTrack(ok, manual, track, el, idOrUri) {
  if (el.result.tracks.total === 0) {
    if (/(Vivaldi|Mozart|Beethoven) Recomposed/.test(el.query)) {
      return;
    }
    manual.push(el.query);
    logger.info({track: el.query}, 'No result found');
  } else if (el.result.tracks.total === 1) {
    ok.push(
      idOrUri ? el.result.tracks.items[0].id : el.result.tracks.items[0].uri
    );
  } else if (el.result.tracks.total > 1) {
    let found;
    try {
      const [, st, sar, sal] = /track:(.*) artist:(.*) album:(.*)/.exec(
        el.query.toLocaleLowerCase()
      );
      found = el.result.tracks.items.find(
        (item) =>
          item.name.toLocaleLowerCase() === st &&
          item.album.name.toLocaleLowerCase() === sal &&
          item.artists[0].name.toLocaleLowerCase() === sar
      );
      if (!found) {
        const altTitle = /(.*) \((.*)\)/.exec(st);
        if (altTitle) {
          const altst = `${altTitle[1]} - ${altTitle[2]}`;
          found = el.result.tracks.items.find(
            (item) =>
              item.name.toLocaleLowerCase() === altst &&
              item.album.name.toLocaleLowerCase() === sal &&
              item.artists[0].name.toLocaleLowerCase() === sar
          );
        }
      }
    } catch (err) {}
    if (found) {
      ok.push(idOrUri ? found.id : found.uri);
    } else {
      manual.push(el.query);
      logger.info(
        {
          track: el.query,
          found: el.result.tracks.items.map((a) =>
            [a.name, a.album.name, a.artists.map((a) => a.name).join('/')].join(
              ' :: '
            )
          ),
        },
        'Multiple results'
      );
    }
  }
}

/**
 *
 */
async function main() {
  const res = JSON.parse(
    (await readFile('./data/spotify-tracks-mapping.json')).toString()
  );
  /** @type {{playlists: import('../lib/interfaces/deezer.mjs').PlaylistAndTracks[], favourites: import('../lib/interfaces/deezer.mjs').Favourites}} */
  const deezer = JSON.parse((await readFile('./data/deezer.json')).toString());

  /** @type {Map<number, {type: Music.SpotifyTypes, query: string, deezerId: string, result: Music.SpotifySearchResult}>} */
  const map = new Map(res.map((el) => [el.deezerId, el]));

  const todo = {
    artists: [],
    albums: [],
    tracks: [],
    playlists: [],
    manualArtists: [],
    manualAlbums: [],
    manualTracks: [],
    manualPlaylists: [],
  };

  for (const track of deezer.favourites.tracks) {
    const el = map.get(track.id);
    matchTrack(todo.tracks, todo.manualTracks, track, el, true);
  }

  for (const album of deezer.favourites.albums) {
    const el = map.get(album.id);
    if (el.result.albums.total === 0) {
      if (/(Vivaldi|Mozart|Beethoven) Recomposed/.test(el.query)) {
        continue;
      }
      todo.manualAlbums.push(el.query);
      logger.info({album: el.query}, 'No result found');
    } else if (el.result.albums.total === 1) {
      todo.albums.push(el.result.albums.items[0].id);
    } else if (el.result.albums.total > 1) {
      const [, sal, sar] = /album:(.*) artist:(.*)/.exec(
        el.query.toLocaleLowerCase()
      );
      const found = el.result.albums.items.find(
        (item) =>
          item.name.toLocaleLowerCase() === sal &&
          item.artists[0].name.toLocaleLowerCase() === sar
      );
      if (found) {
        todo.albums.push(found.id);
      } else {
        todo.manualAlbums.push(el.query);
        logger.info(
          {
            album: el.query,
            found: el.result.albums.items.map((a) =>
              [a.name, a.artists.map((a) => a.name).join('/')].join(' :: ')
            ),
          },
          'Multiple results'
        );
      }
    }
  }

  for (const album of deezer.favourites.artists) {
    const el = map.get(album.id);
    if (el.result.artists.total === 0) {
      logger.info({artist: el.query}, 'No result found');
      todo.manualArtists.push(el.result.artists.items[0].id);
    } else if (el.result.artists.total === 1) {
      todo.artists.push(el.result.artists.items[0].id);
    } else if (el.result.artists.total > 1) {
      const [, sar] = /artist:(.*)/.exec(el.query.toLocaleLowerCase());
      const found = el.result.artists.items.find(
        (item) => item.name.toLocaleLowerCase() === sar
      );
      if (found) {
        todo.artists.push(found.id);
      } else {
        todo.manualArtists.push(el.query);
        logger.info(
          {artist: el.query, found: el.result.artists.items.map((a) => a.name)},
          'Multiple results'
        );
      }
    }
  }

  for (const playlist of deezer.playlists) {
    if (playlist.playlist.title === 'Loved Tracks') {
      continue;
    }
    const playTodo = {
      name: playlist.playlist.title,
      tracks: [],
    };
    const playManual = {
      name: playlist.playlist.title,
      tracks: [],
    };
    for (const track of playlist.tracklist) {
      const el = map.get(track.id);
      matchTrack(playTodo.tracks, playManual.tracks, track, el, false);
    }
    todo.playlists.push(playTodo);
    if (playManual.tracks.length > 0) {
      todo.manualPlaylists.push(playManual);
    }
  }

  await writeFile('./data/work-to-do.json', JSON.stringify(todo, null, ' '));
}

main();
