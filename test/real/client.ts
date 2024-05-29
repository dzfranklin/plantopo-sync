import { parseArgs } from "std/cli/parse_args.ts";
import { PGCSource } from "../../core/Random/PGCSource.ts";
import { ClientDocSave, Random } from "../../core/index.ts";
import { setupLogs, logger } from "../setupLogs.ts";
import { openDoc } from "../../browser/openDoc.ts";
import { TextLineStream } from "jsr:@std/streams@0.223.0/text-line-stream";
import { JsonParseStream } from "jsr:@std/json@0.223.0/json-parse-stream";
import { ClientDocSaveSchema } from "../../core/DocPersistence.ts";

setupLogs();

const args = parseArgs(Deno.args);

const serverPort = args.serverPort || "4100";

const id = parseInt(args.id);
if (isNaN(id)) {
  console.error("--id <number> is required");
  Deno.exit(1);
}

const disableFakeLatency = !!args.disableFakeLatency;

const initialState = ClientDocSaveSchema.nullable().parse(
  JSON.parse(args.initialState)
);

const rng = new PGCSource(0, 42 + id, 0, 54);
Random.__debugSetGlobal(rng);

let persisted: ClientDocSave | null = initialState;

const doc = openDoc(
  {
    endpoint: `ws://localhost:${serverPort}/v1`,
    acquireToken: () => Promise.resolve("token-" + id.toString()),
    logger,
    persistence: {
      load: async () => persisted,
      save: async (_doc, save) => {
        persisted = save;
      },
    },
    extraParams: disableFakeLatency
      ? {}
      : {
          _fakeLatency: "20",
        },
  },
  "doc"
);

const stdin = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream())
  .pipeThrough(new JsonParseStream());

for await (const line of stdin as AsyncIterable<any>) {
  switch (line.type) {
    case "call": {
      const { method, args } = line;
      if (typeof (doc as any)[method] !== "function") {
        throw new Error("unknown method " + method);
      }
      const ret = (doc as any)[method](...args);
      const res = ret instanceof Promise ? await ret : ret;
      console.log(JSON.stringify({ type: "callResult", result: res }));
    }
    case "inspect": {
      console.log(
        JSON.stringify({
          type: "inspectResult",
          persisted,
          status: doc.status(),
        })
      );
    }
  }
}
