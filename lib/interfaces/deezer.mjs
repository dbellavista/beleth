/**
 * @file lib/interfaces/deezer.mjs
 * @author Daniele Bellavista
 */

import bunyan from 'bunyan';
import {execFile} from 'node:child_process';
import {once} from 'node:events';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {URL, URLSearchParams} from 'node:url';
import superagent from 'superagent';

const CACHED_TOKEN_FILE = './.deezer-token';

/**
 * @typedef {object} PlaylistAndTracks
 * @property {Music.DeezerPlaylist} playlist
 * @property {Music.DeezerTrack[]} tracklist
 */

/**
 * @typedef {object} Favourites
 * @property {Music.DeezerArtist[]} artists
 * @property {Music.DeezerAlbum[]} albums
 * @property {Music.DeezerTrack[]} tracks
 */

export class Deezer {
  constructor({appID, appSecret, callbackURL}) {
    this.appID = appID;
    this.appSecret = appSecret;
    this.callbackUrl = callbackURL;
    this.logger = bunyan.createLogger({
      name: 'Deezer',
      serializers: bunyan.stdSerializers,
    });
  }

  async auth() {
    try {
      const cached = (await readFile(CACHED_TOKEN_FILE)).toString();
      if (cached) {
        this.accessToken = cached;
        this.logger.info('Using cached access token');
        return;
      }
    } catch (err) {}
    const u = new URLSearchParams();
    u.set('app_id', this.appID);
    u.set('redirect_uri', this.callbackUrl);
    u.set('perms', 'email,offline_access,listening_history');
    const p = execFile('xdg-open', [
      'https://connect.deezer.com/oauth/auth.php?' + u.toString(),
    ]);
    await once(p, 'close');
    const url = new URL(this.callbackUrl);
    /** @type {import('http').Server} */
    let server;
    try {
      await new Promise((resolve, reject) => {
        server = createServer(async (req, res) => {
          try {
            const code = new URL(url.toString() + req.url).searchParams.get(
              'code'
            );
            const params = new URLSearchParams();
            params.set('code', code);
            params.set('app_id', this.appID);
            params.set('secret', this.appSecret);
            const resp = await superagent(
              'https://connect.deezer.com/oauth/access_token.php?' +
                params.toString()
            );
            if (resp.statusCode === 200 && /access_token=/.test(resp.text)) {
              const parsed = new URLSearchParams(resp.text);
              this.accessToken = parsed.get('access_token');
            } else {
              throw new Error(
                `Cannot retrieve access token: ${resp.statusCode} ${resp.text}`
              );
            }
            this.logger.info('Got access token!');
            res.writeHead(200);
            res.end('Got access token');
            resolve();
          } catch (err) {
            res.writeHead(500);
            res.end(err.message);
            reject(err);
          }
        }).on('error', (err) => {
          reject(err);
        });

        // Grab an arbitrary unused port.
        server.listen({
          host: url.host,
          port: parseInt(url.port || '80'),
        });
      });
      await writeFile(CACHED_TOKEN_FILE, this.accessToken);
    } finally {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  }

  /**
   *
   * @returns {Promise<Array<PlaylistAndTracks>>}
   */
  async getPlaylists() {
    const resp = await superagent(
      'https://api.deezer.com/user/me/playlists?limit=50&' + this._auth()
    );
    /** @type {Music.DeezerPlaylist[]} */
    const playlists = resp.body.data;
    const result = [];
    for (const playlist of playlists) {
      const tracks = [];
      let done = false;
      let index = 0;
      while (!done) {
        this.logger.info(
          {playlist: playlist.title, index},
          'Getting tracklist'
        );
        const resp = await superagent(
          `${playlist.tracklist}?limit=50&index=${index}&${this._auth()}`
        );
        if (resp.body.data.length === 0) {
          done = true;
        } else {
          index += resp.body.data.length;
          tracks.push(...resp.body.data);
        }
      }
      result.push({playlist, tracklist: tracks});
    }
    return result;
  }

  /**
   *
   * @returns {Promise<Favourites>}
   */
  async getFavourites() {
    const res = {
      artists: [],
      albums: [],
      tracks: [],
    };
    for (const k of Object.keys(res)) {
      let done = false;
      let index = 0;
      while (!done) {
        this.logger.info({what: k, index}, 'Getting favourites');
        const resp = await superagent(
          `https://api.deezer.com/user/me/${k}?limit=50&index=${index}&${this._auth()}`
        );
        if (resp.body.data.length === 0) {
          done = true;
        } else {
          index += resp.body.data.length;
          res[k].push(...resp.body.data);
        }
      }
    }
    return res;
  }

  _auth() {
    return new URLSearchParams([
      ['access_token', this.accessToken],
      ['output', 'json'],
    ]).toString();
  }
}
