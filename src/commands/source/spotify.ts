import { Command, flags } from "@oclif/command";
import http from "http";
import cli from "cli-ux";
import * as inquirer from "inquirer";
import SpotifySource from "../../lib/spotify";
import Listr from "listr";
import { map, tap } from "rxjs/operators";
import AspenDB from "@aspen.cloud/aspendb";
import { from } from "rxjs";
import { iResource } from "../../lib/types";
import url from "url";

/**
 * Steps
 * 1) List resources as checkboxes
 * 2) Authorize user with appropriate scopes (save token)
 * 3) Start downloading resources (use smart queue and appropriate limits)
 * 4) Either save to database, preview interactively (paging), or output to stdout [default: save]
 */

export class Spotify extends Command {
  static description = "Download spotify data with Aspen.";

  static examples = [
    `$ SPOTIFY_CLIENT_ID=your-client-id SPOTIFY_CLIENT_SECRET=your-client-secret aspen source:spotify
`
  ];

  static flags = {
    preview: flags.boolean({
      char: "p",
      description: "Lets you preview the data for the resource.",
      default: false
    })
  };

  async run() {
    const { args, flags } = this.parse(Spotify);

    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      console.error("No client credentials supplied for Spotify");
      console.error(
        "You must set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET enviromental variables."
      );
      cli.url(
        "Spotify Developer Dashboard",
        `https://developer.spotify.com/dashboard`
      );
      return;
    }

    const spotify = new SpotifySource(
      process.env.SPOTIFY_CLIENT_ID,
      process.env.SPOTIFY_CLIENT_SECRET,
      "http://localhost:8111/source/spotify/callback/"
    );

    const db = new AspenDB().app("spotify");

    const prompt = inquirer.createPromptModule({ output: process.stderr });
    const choice = await prompt([
      {
        name: "resources",
        message: "Select which resources to download",
        type: "checkbox",
        choices: Object.entries(spotify.resources).map(([key, resource]) => ({
          name: resource.name,
          value: key
        }))
      }
    ]);

    if (flags.preview) {
      const { authURL, waitForAuth } = await spotify.getAuthUrl();
      if (authURL) {
        cli.open(authURL);
      }
      await waitForAuth;

      const output = process.stdout;
      const getter = spotify.getTracksGenerator();
      let { value: tracks, done } = await getter.next();
      output.write(JSON.stringify(tracks));
      output.end();
      while ((await cli.prompt("More?")) === "y" && !done) {
        ({ value: tracks, done } = await getter.next());
        output.write(JSON.stringify(tracks));
        output.end();
      }
      output.end();
      return;
    }

    function getTaskForResource(resource: iResource): Listr.ListrTask {
      return {
        title: `Downloading ${resource.label}`,
        task: async (ctx, task) => {
          let numDownloaded = 0;
          return resource.get().pipe(
            tap(({ items, total }: { items: any[]; total: number }) => {
              return from(db.addAll(items));
            }),
            map(({ items, total }: { items: any[]; total: number }) => {
              numDownloaded += items.length;
              return `Downloaded ${numDownloaded}/${total}`;
            })
          );
        }
      };
    }

    const tasks: Listr.ListrTask[] = choice.resources
      .map((resourceName: string) => spotify.getResource(resourceName))
      .map((resource: iResource) => getTaskForResource(resource));

    const taskRunner = new Listr(
      [
        {
          title: "Authorizing with Spotify",
          task: async (ctx, task) => {
            const authURL = spotify.getAuthUrl();
            if (authURL) {
              task.output = "Please go to " + authURL;
              cli.open(authURL);
            }
            const code = await waitForAuthCallback();
            await spotify.setCode(code);
          }
        },
        {
          title: "Downloading data",
          task: () => new Listr(tasks, { concurrent: true })
        }
      ],
      { concurrent: false }
    );

    taskRunner
      .run()
      .then(async () => {
        console.error("Successfuly downloaded.");
      })
      .catch(err => {
        console.error(err);
      });
  }
}

async function waitForAuthCallback(): Promise<string> {
  let server: http.Server;
  return new Promise<string>((resolve, reject) => {
    server = http
      .createServer(function(req: any, res: any) {
        const queryData = url.parse(req.url, true).query;
        const code = queryData.code as string;
        resolve(code);
        res.writeHead(200);
        res.write("Successfully authorized. You can close this tab now.");
        res.end();
      })
      .listen(8111);
  }).finally(() => {
    server.close();
  });
}
