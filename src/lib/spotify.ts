var http = require("http");
const { URL } = require("url");
import Queue from "smart-request-balancer";
import { Observable, from } from "rxjs";
const SpotifyWebApi = require("spotify-web-api-node");
import * as fs from "fs-extra";
import { mergeMap } from "rxjs/operators";
import { TrackSchema } from "./TrackSchema";
import { Spotify as SpotifyTypes } from "./types";

const clientID = process.env.SPOTIFY_CLIENT_ID || "";

const callbackUrl = "http://localhost:8111/auth-callback/";

const spotifyApi = new SpotifyWebApi({
  redirectUri: callbackUrl,
  clientId: clientID
});

const scopes = ["user-library-read", "playlist-read-private"];

export default spotifyApi;

const queue = new Queue({
  rules: {
    common: {
      rate: 3,
      limit: 1,
      priority: 1
    }
  }
});

const TokenForwardPage = `
    <html>
    <head>
    </head>
    <body>
    <div>Please wait...</div>
    <script>
        window.onload = () => {
            const hash = window.location.hash.substring(1);
            console.log(hash);
            fetch("http://localhost:8111/accessToken?" + hash).then(() => {
                document.write('<div>Succesfully authenticated. You can now close this tab.</div>');
            })
        }
    </script>
    </body>
    </html>
`;

export function createAuthUrl({
  clientID,
  redirectURI,
  scopes
}: {
  clientID: string;
  redirectURI: string;
  scopes: string[];
}) {
  return `https://accounts.spotify.com/authorize?client_id=${clientID}&response_type=token&redirect_uri=${encodeURI(
    redirectURI
  )}&scope=${encodeURI(scopes.join(" "))}`;
}

export async function startAuth(tokenPath: string) {
  await fs.ensureFile(tokenPath);
  try {
    const userConfig = await fs.readJSON(tokenPath, { throws: false });

    if (userConfig?.token && userConfig.expiresAt > new Date().getTime()) {
      spotifyApi.setAccessToken(userConfig.token);
      return {
        waitForAuth: Promise.resolve()
      };
    }
  } catch (e) {
    console.error(e);
  }
  const waitForAuth = new Promise(async (resolve, reject) => {
    const server = http
      .createServer(function(req: any, res: any) {
        if (req.url.includes("accessToken")) {
          const queryData = new URL(req.url, `http://${req.headers.host}`);
          const token = queryData.searchParams.get("access_token");
          spotifyApi.setAccessToken(token);
          res.writeHead(200);
          res.end();
          server.close();
          return fs
            .writeJSON(tokenPath, {
              token,
              expiresAt: new Date().getTime() + 3600 * 1000
            })
            .then(() => {
              resolve();
            });
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.write(TokenForwardPage);
        res.end();
      })
      .listen(8111);
  });

  return {
    authURL: createAuthUrl({ clientID, redirectURI: callbackUrl, scopes }),
    waitForAuth
  };
}

export async function* getTracksGenerator() {
  const limit = 20;
  let offset = 0;
  const { body } = await spotifyApi.getMySavedTracks({ limit, offset });
  let { items, next, total } = body;
  while (next) {
    yield items;
    offset += limit;
    const { body: nextBody } = await spotifyApi.getMySavedTracks({
      limit,
      offset
    });
    items = nextBody.items;
    next = nextBody.next;
  }
  return body.items;
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
      subscriber.complete();
    })();
  });
}

export function getTracks(): Observable<{ items: any[]; total?: number }> {
  return getAll(spotifyPaginator(spotifyApi.getMySavedTracks.bind(spotifyApi)));
}

const getAlbums = () => {
  return getAll(spotifyPaginator(spotifyApi.getMySavedAlbums.bind(spotifyApi)));
};

export function getPlaylists(): Observable<{ items: any[]; total?: number }> {
  return from(spotifyApi.getMe() as Promise<{ body: { id: string } }>).pipe(
    mergeMap(({ body }) => {
      return getAll(
        spotifyPaginator(spotifyApi.getUserPlaylists.bind(spotifyApi, body.id))
      );
    })
  );
}

export const resources: { [key: string]: SpotifyTypes.iResource } = {
  tracks: {
    name: SpotifyTypes.ResourceType.tracks,
    label: "Your saved tracks",
    scopes: ["user-library-read"],
    get: getTracks,
    schema: TrackSchema
  },
  albums: {
    name: Spotify.ResourceType.albums,
    label: "Your saved albums",
    scopes: ["user-library-read"],
    get: getAlbums
  },
  playlists: {
    name: SpotifyTypes.ResourceType.playlists,
    label: "Your playlists",
    scopes: ["playlist-read-private"],
    get: getPlaylists
  }
};

export function getResource(name: string): SpotifyTypes.iResource {
  return resources[name];
}
