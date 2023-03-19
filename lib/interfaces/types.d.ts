namespace Music {
  interface DeezerPlaylist {
    id: number;
    title: string;
    duration: number;
    public: boolean;
    is_loved_track: boolean;
    collaborative: boolean;
    nb_tracks: number;
    fans: number;
    link: string;
    picture: string;
    picture_small: string;
    picture_medium: string;
    picture_big: string;
    picture_xl: string;
    checksum: string;
    tracklist: string;
    creation_date: string;
    md5_image: string;
    picture_type: string;
    time_add: number;
    time_mod: number;
    creator: {
      id: number;
      name: string;
      tracklist: string;
      type: string;
    };
    type: string;
  }

  interface DeezerBaseAlbum {
    id: number;
    title: string;
    cover: string;
    cover_small: string;
    cover_medium: string;
    cover_big: string;
    cover_xl: string;
    md5_image: string;
    tracklist: string;
    type: string;
  }

  interface DeezerAlbum extends DeezerBaseAlbum {
    artist: DeezerArtist;
  }

  interface DeezerArtist {
    id: number;
    name: string;
    link: string;
    picture: string;
    picture_small: string;
    picture_medium: string;
    picture_big: string;
    picture_xl: string;
    tracklist: string;
    type: string;
  }

  interface DeezerTrack {
    id: number;
    readable: boolean;
    title: string;
    title_short: string;
    title_version: string;
    link: string;
    duration: number;
    rank: number;
    explicit_lyrics: boolean;
    explicit_content_lyrics: number;
    explicit_content_cover: number;
    preview: string;
    md5_image: string;
    time_add: number;
    artist: DeezerArtist;
    album: DeezerBaseAlbum;
    type: string;
  }

  interface PaginatedResult<T> {
    href: string;
    limit: number;
    next: string;
    offset: number;
    previous: string;
    total: number;
    items: T[];
  }

  type SpotifyTypes = 'track' | 'album' | 'artist';

  interface SpotifyUser {
    display_name: string;
    external_urls: Record<string, string>;
    href: string;
    id: string;
    type: string;
    uri: string;
  }

  interface SpotifyPlaylist {
    collaborative: boolean;
    description: string;
    external_urls: Record<string, string>;
    followers: {
      href: string;
      total: number;
    };
    href: string;
    id: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    name: string;
    owner: SpotifyUser;
    primary_color: string;
    public: boolean;
    snapshot_id: string;
    tracks: PaginatedResult<SpotifyTrack>;
    type: string;
    uri: string;
  }

  interface SpotifyArtist {
    external_urls: Record<string, string>;
    href: string;
    id: string;
    name: string;
    type: string;
    uri: string;
  }
  interface SpotifyAlbum {
    album_group: string;
    album_type: string;
    artists: SpotifyArtist[];
    available_markets: string[];
    external_urls: Record<string, string>;
    href: string;
    id: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    is_playable: boolean;
    name: string;
    release_date: string;
    release_date_precision: string;
    total_tracks: number;
    type: string;
    uri: string;
  }

  interface SpotifyTrack {
    album: SpotifyAlbum;
    artists: SpotifyArtist[];
    available_markets: string[];
    disc_number: number;
    duration_ms: number;
    explicit: boolean;
    external_ids: Record<string, string>;
    external_urls: Record<string, string>;
    href: string;
    id: string;
    is_local: boolean;
    name: string;
    popularity: number;
    preview_url: string;
    track_number: number;
    type: string;
    uri: string;
  }

  interface SpotifySearchResult {
    tracks: PaginatedResult<SpotifyTrack>;
    artists: PaginatedResult<SpotifyArtist>;
    albums: PaginatedResult<SpotifyAlbum>;
    playlists: PaginatedResult<SpotifyPlaylist>;
  }
}
