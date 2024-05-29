import { Clock } from "../../core/Clock.ts";
import { PGCSource } from "../../core/Random/PGCSource.ts";
import { Random } from "../../core/index.ts";
import { DocDB } from "../../server/DocDB.ts";
import { DocManager } from "../../server/DocManager.ts";
import * as log from "../../server/log.ts";
import mux, { HandlerConfig } from "../../server/handlers/mux.ts";
import { parseArgs } from "std/cli/parse_args.ts";
import { setupLogs } from "../setupLogs.ts";
import { Tracer } from "../../server/Tracer.ts";

setupLogs();

const args = parseArgs(Deno.args);

const requiredArg = (name: string) => {
  if (Object.keys(args).indexOf(name) === -1) {
    console.error(`--${name} is required`);
    Deno.exit(1);
  }
  return args[name];
};

const port = parseInt(requiredArg("port"));
const probabilityAuthIssue = parseFloat(requiredArg("probabilityAuthIssue"));
const stateDir = requiredArg("stateDir");
const seed = parseInt(requiredArg("seed"));

Deno.mkdirSync(stateDir, { recursive: true });

const rng = new PGCSource(0, seed, 0, 54);
Random.__debugSetGlobal(rng);

const docDB = await DocDB.open({ path: stateDir });

const docs = new DocManager({
  persistence: docDB,
  logger: log.Logger,
});

const tracer = await Tracer.open(stateDir);

const handlerConfig: HandlerConfig = {
  doc: {
    docManager: docs,
    authenticator: {
      authenticate: (token) =>
        Promise.resolve({
          id: "id-" + token,
          name: "Name " + token,
          isAnonymous: Random.float() < 0.5,
        }),
    },
    authorizer: {
      check: (_user, _doc) => {
        const r = Random.float();
        if (r < probabilityAuthIssue) {
          if (Random.float() < 0.5) return Promise.resolve("none");
          return Promise.resolve("read");
        }
        return Promise.resolve("write");
      },
      checkAdmin: (_token) => Random.float() > 0.8,
    },
    tracer,
  },
};

await docs.create("doc");

let server = Deno.serve(
  {
    port,
    onListen: (addr) => log.info(`Listening on ${addr.hostname}:${addr.port}`),
  },
  mux(handlerConfig)
);

Deno.addSignalListener("SIGINT", async () => {
  console.log("Shutting down server");

  await server.shutdown();

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await tracer.close();

  console.log("Shut down server");

  Deno.exit();
});
