import * as log from "./log.ts";
import { ConsoleHandler } from "std/log/mod.ts";
import { DocManager } from "./DocManager.ts";
import mux, { HandlerConfig } from "./handlers/mux.ts";
import * as dotenv from "std/dotenv/mod.ts";
import { TestAllowAllAuthorizer } from "./Authorizer.ts";
import { TestAlwaysBobAuthenticator } from "./Authenticator.ts";
import { parseArgs } from "std/cli/parse_args.ts";
import { DocDB } from "./DocDB.ts";

await dotenv.load({ export: true });
const env = Deno.env.toObject();

function mustEnv(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`missing env var: ${name}`);
  return value;
}

const args = parseArgs(Deno.args);

// Read environment
const hostname = env["HOST"] || "0.0.0.0";
const port = parseInt(env["PORT"] || "4000");
const docPath = mustEnv("DOC_PATH");

// Setup logging
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

log.info("Starting", { args, hostname, port, docPath });

// Configure

const docDB = await DocDB.open({ path: docPath });

const docManager = new DocManager({
  persistence: docDB,
  logger: log.Logger,
});

const authorizer = TestAllowAllAuthorizer; // TODO: implement
const authenticator = TestAlwaysBobAuthenticator; // TODO: implement

const muxConfig: HandlerConfig = {
  doc: { authenticator, authorizer, docManager },
};

// Serve

Deno.serve({ hostname, port }, mux(muxConfig));
