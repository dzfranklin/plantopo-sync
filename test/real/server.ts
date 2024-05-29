import { Clock } from "../../core/Clock.ts";
import { PGCSource } from "../../core/Random/PGCSource.ts";
import { Random } from "../../core/index.ts";
import { DocDB } from "../../server/DocDB.ts";
import { DocManager } from "../../server/DocManager.ts";
import * as log from "../../server/log.ts";
import mux, { HandlerConfig } from "../../server/handlers/mux.ts";
import { parseArgs } from "std/cli/parse_args.ts";
import { setupLogs } from "../setupLogs.ts";

setupLogs();

const args = parseArgs(Deno.args);
console.log("server", JSON.stringify(args));

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

Deno.mkdirSync(stateDir, { recursive: true });

const rng = new PGCSource(0, 42, 0, 54);
Random.__debugSetGlobal(rng);

const docDB = await DocDB.open({ path: stateDir });

const docs = new DocManager({
  persistence: docDB,
  logger: log.Logger,
});

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
  log.info("Shutting down");

  await server.shutdown();

  const docState = await docDB.load("doc");

  const doneMsg = {
    type: "done",
    state: {
      doc: docState,
      clock: Clock.now(),
      rng: rng.next32(),
    },
  };
  try {
    await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(doneMsg)));
  } catch (err) {}

  Deno.exit();
});
