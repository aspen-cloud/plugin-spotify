import Queue from "smart-request-balancer";
import { Observable, from } from "rxjs";
const SpotifyWebApi = require("spotify-web-api-node");
import { mergeMap } from "rxjs/operators";

type ResourceGetter = (options?: any) => Observable<any>;

type RateLimit = {
  rate: number;
  limit: number;
};

export interface iResource {
  scopes: string[];
  name: ResourceType;
  label: string;
  get: ResourceGetter;
  rateLimit?: RateLimit;
  options?: any;
  schema?: {};
}

export enum ResourceType {
  tracks = "tracks",
  albums = "albums",
  playlists = "playlists"
}

const queue = new Queue({
  rules: {
    common: {
      rate: 4,
      limit: 1,
      priority: 1
    }
  }
});

export default class SpotifySource {
  spotifyApi: any;
  constructor(clientId: string, clientSecret: string, callbackUrl: string) {
    this.spotifyApi = new SpotifyWebApi({
      redirectUri: callbackUrl,
      clientId,
      clientSecret
    });
  }

  static scopes = ["user-library-read", "playlist-read-private"];

  getAuthUrl() {
    return this.spotifyApi.createAuthorizeURL(
      SpotifySource.scopes,
      "aspen-state"
    );
  }

  async setCode(code: string) {
    const data = await this.spotifyApi.authorizationCodeGrant(code);
    this.spotifyApi.setAccessToken(data.body["access_token"]);
    this.spotifyApi.setRefreshToken(data.body["refresh_token"]);
  }

  async *getTracksGenerator() {
    const limit = 20;
    let offset = 0;
    const { body } = await this.spotifyApi.getMySavedTracks({ limit, offset });
    let { items, next, total } = body;
    while (next) {
      yield items;
      offset += limit;
      const { body: nextBody } = await this.spotifyApi.getMySavedTracks({
        limit,
        offset
      });
      items = nextBody.items;
      next = nextBody.next;
    }
    return body.items;
  }

  getTracks(): Observable<{ items: any[]; total?: number }> {
    return getAll(
      spotifyPaginator(this.spotifyApi.getMySavedTracks.bind(this.spotifyApi))
    );
  }

  getAlbums() {
    return getAll(
      spotifyPaginator(this.spotifyApi.getMySavedAlbums.bind(this.spotifyApi))
    );
  }

  getPlaylists(): Observable<{ items: any[]; total?: number }> {
    return from(
      this.spotifyApi.getMe() as Promise<{ body: { id: string } }>
    ).pipe(
      mergeMap(({ body }) => {
        return getAll(
          spotifyPaginator(
            this.spotifyApi.getUserPlaylists.bind(this.spotifyApi, body.id)
          )
        );
      })
    );
  }

  resources: { [key: string]: iResource } = {
    tracks: {
      name: ResourceType.tracks,
      label: "Your saved tracks",
      scopes: ["user-library-read"],
      get: this.getTracks.bind(this)
    },
    albums: {
      name: ResourceType.albums,
      label: "Your saved albums",
      scopes: ["user-library-read"],
      get: this.getAlbums.bind(this)
    },
    playlists: {
      name: ResourceType.playlists,
      label: "Your playlists",
      scopes: ["playlist-read-private"],
      get: this.getPlaylists.bind(this)
    }
  };

  getResource(name: string): iResource {
    return this.resources[name];
  }
}

async function queueRequest(method: Function, key: string) {
  return queue.request(
    retry =>
      method()
        .then((data: any) => data)
        .catch((err: any) => {
          console.error(err);
          retry(err?.response?.data?.parameters?.retry_after || 3000);
        }),
    key
  );
}

async function* spotifyPaginator(method: Function) {
  const limit = 20;
  let offset = 0;
  const { body } = await queueRequest(
    () => method({ limit, offset }),
    "" + limit + offset
  );
  let { items, next, total } = body;
  while (next) {
    yield { items, total };
    offset += limit;
    const { body: nextBody } = await queueRequest(
      () => method({ limit, offset }),
      "" + limit + offset
    );
    items = nextBody.items;
    next = nextBody.next;
  }
  yield { items, total };
}

function getAll(
  paginator: AsyncGenerator<any, any, any>
): Observable<{ items: any[]; total?: number }> {
  return new Observable(subscriber => {
    (async () => {
      for await (const items of paginator) {
        subscriber.next(items);
      }
      return subscriber.complete();
    })();
  });
}
