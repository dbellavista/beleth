/**
 * @file lib/interfaces/spotify.mjs
 * @author Daniele Bellavista
 */

import bunyan from 'bunyan';
import {execFile} from 'node:child_process';
import {once} from 'node:events';
import {readFile, unlink, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {setTimeout} from 'node:timers/promises';
import {URL, URLSearchParams} from 'node:url';
import superagent from 'superagent';

const CACHED_TOKEN_FILE = './.spotify-token';
const SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-modify',
  'user-follow-modify',
];

/**
 * @typedef {object} AccessToken
 * @property {string} access_token
 * @property {'Bearer'} token_type
 * @property {string} scope
 * @property {number} expires_in
 * @property {string} refresh_token
 * @property {number} expires_at
 */

export class Spotify {
  constructor({appID, appSecret, callbackURL}) {
    this.appID = appID;
    this.appSecret = appSecret;
    this.callbackUrl = callbackURL;
    /** @type {string} */
    this.userId;
    this.logger = bunyan.createLogger({
      name: 'Spotify',
      serializers: bunyan.stdSerializers,
    });
    /** @type {AccessToken} */
    this.accessToken = null;
  }

  async auth(override = false) {
    if (override) {
      try {
        await unlink(CACHED_TOKEN_FILE);
      } catch (err) {}
    }
    try {
      const cached = JSON.parse((await readFile(CACHED_TOKEN_FILE)).toString());
      if (cached.access_token) {
        this.accessToken = cached;
        this.logger.info('Using cached access token');
        return;
      }
    } catch (err) {}
    const u = new URLSearchParams();
    u.set('client_id', this.appID);
    u.set('response_type', 'code');
    u.set('redirect_uri', this.callbackUrl);
    u.set('scope', SCOPES.join(' '));
    const p = execFile('xdg-open', [
      'https://accounts.spotify.com/authorize?' + u.toString(),
    ]);
    await once(p, 'close');
    const url = new URL(this.callbackUrl);
    /** @type {import('http').Server} */
    let server;
    try {
      await new Promise((resolve, reject) => {
        server = createServer(async (req, res) => {
          try {
            const pu = new URL(url.toString() + req.url).searchParams;
            if (pu.get('error')) {
              throw new Error(pu.get('error'));
            }
            const code = pu.get('code');
            try {
              const resp = await superagent
                .post('https://accounts.spotify.com/api/token')
                .type('form')
                .send({
                  code,
                  redirect_uri: this.callbackUrl,
                  grant_type: 'authorization_code',
                })
                .auth(this.appID, this.appSecret);
              if (resp.statusCode === 200 && resp.body.access_token) {
                this.accessToken = {
                  ...resp.body,
                  expires_at: Date.now() + resp.body.expires_in * 1000,
                };
              } else {
                throw new Error(
                  `Cannot retrieve access token: ${resp.statusCode} ${resp.text}`
                );
              }
            } catch (err) {
              this.logger.error({err}, 'Could not retrieve the token');
              throw err;
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
      await writeFile(CACHED_TOKEN_FILE, JSON.stringify(this.accessToken));
    } catch (err) {
      this.accessToken = null;
      throw err;
    } finally {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  }

  /**
   *
   * @param {string} query
   * @param {Music.SpotifyTypes[]} types
   * @returns {Promise<Music.SpotifySearchResult>}
   */
  async searchItem(query, types) {
    const par = new URLSearchParams();
    par.set('q', query);
    par.set('type', types.join(','));
    const resp = await this._wrap(() =>
      superagent('https://api.spotify.com/v1/search?' + par.toString())
    );
    return resp.body;
  }

  /**
   *
   * @returns {Promise<Music.PaginatedResult<Music.SpotifyPlaylist>>}
   */
  async getPlaylists() {
    const resp = await this._wrap(() =>
      superagent('https://api.spotify.com/v1/me/playlists')
    );
    return resp.body;
    // /** @type {Music.SpotifyPlaylist[]} */
    // const playlists = resp.body.data;
    // const result = [];
    // for (const playlist of playlists) {
    //  const trResp = await superagent(playlist.tracklist);
    //  result.push({playlist, tracklist: trResp.body.data});
    // }
    // return result;
  }

  /**
   *
   * @param {string} name
   * @param {string} description
   * @returns {Promise<Music.SpotifyPlaylist>}
   */
  async createPlaylist(name, description) {
    if (!this.userId) {
      const user = await this._wrap(() =>
        superagent('https://api.spotify.com/v1/me')
      );
      this.userId = user.body.id;
    }
    const resp = await this._wrap(() =>
      superagent
        .post(`https://api.spotify.com/v1/users/${this.userId}/playlists`)
        .type('json')
        .send({
          name,
          public: true,
          description,
        })
    );
    return resp.body;
  }

  /**
   * @template T
   * @param {Music.PaginatedResult<T>} base
   * @returns {Promise<T[]>}
   */
  async getAllPaginated(base) {
    /** @type {T[]} */
    const results = [];

    if (base.total === 0) {
      return results;
    }
    results.push(...base.items);

    let next = base.next;
    while (next) {
      /** @type {Music.PaginatedResult<T>} */
      const res = (await this._wrap(() => superagent(next))).body;
      if (base.items) {
        results.push(...res.items);
      }
      next = res.next;
    }

    return results;
  }

  /**
   *
   * @param {string[]} artists
   */
  async followArtists(artists) {
    await this._wrap(() =>
      superagent
        .put(`https://api.spotify.com/v1/me/following?type=artist`)
        .type('json')
        .send({
          ids: artists,
        })
    );
  }

  /**
   *
   * @param {string[]} albums
   */
  async saveAlbums(albums) {
    await this._wrap(() =>
      superagent.put(`https://api.spotify.com/v1/me/albums`).type('json').send({
        ids: albums,
      })
    );
  }

  /**
   *
   * @param {string[]} tracks
   */
  async saveTracks(tracks) {
    await this._wrap(() =>
      superagent.put(`https://api.spotify.com/v1/me/tracks`).type('json').send({
        ids: tracks,
      })
    );
  }

  /**
   *
   * @param {string} playlist
   * @param {string[]} tracks
   */
  async addTracksToPlaylist(playlist, tracks) {
    await this._wrap(() =>
      superagent
        .post(`https://api.spotify.com/v1/playlists/${playlist}/tracks`)
        .type('json')
        .send({
          uris: tracks,
        })
    );
  }

  async refresh() {
    if (!this.accessToken?.refresh_token) {
      throw new Error('No refresh token');
    }
    const resp = await superagent('https://accounts.spotify.com/api/token')
      .type('form')
      .send({
        refresh_token: this.accessToken.refresh_token,
        redirect_uri: this.callbackUrl,
        grant_type: 'refresh_token',
      })
      .auth(this.appID, this.appSecret);

    if (resp.status === 200) {
      this.accessToken.access_token = resp.body.access_token;
      this.accessToken.expires_in = resp.body.expires_in;
      this.accessToken.expires_at = Date.now() + resp.body.expires_at * 1000;
      if (resp.body.refresh_token) {
        this.accessToken.refresh_token = resp.body.refresh_token;
      }
      await writeFile(CACHED_TOKEN_FILE, JSON.stringify(this.accessToken));
    } else {
      throw new Error('Cannot obtain a new token ' + resp.text);
    }
  }

  /**
   * @param {() => superagent.SuperAgentRequest} task
   * @returns {Promise<superagent.Response>}
   */
  async _wrap(task) {
    let overwrittenAuth = false;
    if (!this.accessToken) {
      await this.auth();
    }
    if (Date.now() >= this.accessToken.expires_at - 2000) {
      try {
        await this.refresh();
      } catch (err) {
        overwrittenAuth = true;
        await this.auth(true);
      }
    }

    try {
      return await task().set(
        'Authorization',
        `Bearer ${this.accessToken.access_token}`
      );
    } catch (err) {
      let retry = false;
      if (err.response.statusCode === 401) {
        if (!overwrittenAuth) {
          await this.auth(true);
          retry = true;
        }
      } else if (err.response.statusCode === 504) {
        this.logger.info('Timedout, retrying in a bit');
        await setTimeout(10000);
        retry = true;
      }
      if (retry) {
        return await task().set(
          'Authorization',
          `Bearer ${this.accessToken.access_token}`
        );
      } else {
        throw err;
      }
    }
  }
}
