import * as log from "./log.ts";
import { ConsoleHandler } from "std/log/mod.ts";
import { DocManager } from "./DocManager.ts";
import { handler } from "./handler.ts";
import * as dotenv from "std/dotenv/mod.ts";
import { InMemoryServerDocPersistence } from "../core/DocPersistence.ts";
import { TestAllowAllAuthorizer } from "./Authorizer.ts";
import { TestAlwaysBobAuthenticator } from "./Authenticator.ts";
import { parseArgs } from "std/cli/parse_args.ts";

const env = await dotenv.load();
const args = parseArgs(Deno.args);

log.setup({
  handlers: {
    console: new ConsoleHandler("DEBUG", {
      formatter: (logRecord) => {
        const { levelName, msg, args } = logRecord;
        return `${levelName} ${msg} ${JSON.stringify(args)}`;
      },
    }),
  },

  loggers: {
    default: {
      level: "DEBUG",
      handlers: ["console"],
    },
  },
});

log.debug("Starting", { args });

const docManager = new DocManager({
  doc: {
    persistence: new InMemoryServerDocPersistence(), // TODO: implement
    logger: log.Logger,
  },
});

const authorizer = TestAllowAllAuthorizer; // TODO: implement
const authenticator = TestAlwaysBobAuthenticator; // TODO: implement

const hostname = env["HOST"] || "0.0.0.0";
let port = parseInt(env["PORT"] || "4000");

if (args.playground) {
  port = 4032;
}

Deno.serve({ hostname, port }, handler(authenticator, authorizer, docManager));
