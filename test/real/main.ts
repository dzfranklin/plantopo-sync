#!/usr/bin/env -S deno run --allow-all

import { parseArgs } from "std/cli/parse_args.ts";
import yaml from "npm:yaml@1.10";
import * as log from "std/log/mod.ts";
import { PGCSource } from "../../core/Random/PGCSource.ts";
import { Random } from "../../core/index.ts";
import { assertEquals } from "std/assert/assert_equals.ts";
import stableJSONStringify from "npm:json-stable-stringify@1.1";
import { AssertionError } from "std/assert/assertion_error.ts";
import { equal } from "std/assert/equal.ts";
import { Handle } from "./Handle.ts";
import { logLevelFromEnv } from "../setupLogs.ts";

const start = Date.now();

const logLevel = logLevelFromEnv();
log.setup({
  handlers: {
    default: new log.ConsoleHandler(logLevel),
  },
  loggers: {
    default: {
      level: logLevel,
      handlers: ["default"],
    },
  },
});

const rng = new PGCSource(0, 42, 0, 54);
Random.__debugSetGlobal(rng);

const args = parseArgs(Deno.args);

const serverPort = args.serverPort || "4100";

export const inspectServer = args.inspectServer || false;

const defaultCaseConfig = {
  clients: 10,
  probability_auth_issue: 0.1,
  disable_fake_latency: false,
};

const caseName = args._[0];
const casePath = import.meta.dirname + "/cases/" + caseName + ".yaml";
const caseConfig = {
  ...defaultCaseConfig,
  ...yaml.parse(await Deno.readTextFile(casePath)),
};

console.log(caseConfig);

let timings = new Map<string, number>();

const stateDir = await Deno.makeTempDir();

const clients = new Array(caseConfig.clients)
  .fill(null)
  .map(
    (_, i) =>
      new Handle("client.ts", i, [
        "--serverPort",
        serverPort,
        "--id",
        i.toString(),
        ...(caseConfig.disable_fake_latency ? ["--disableFakeLatency"] : []),
      ])
  );
console.log("Initialized clients");

const doLog = (msg: any) => {
  let impl: (...args: any[]) => void;
  switch (msg.log.level) {
    case "DEBUG":
      impl = log.debug;
      break;
    case "INFO":
      impl = log.info;
      break;
    case "PASSTHROUGH":
      impl = console.log.bind(console);
      break;
    case "WARN":
    case "ERROR":
      impl = log.warn;
      break;
    default:
      impl = log.info;
  }
  impl(
    msg.handle.join(":") +
      "  " +
      msg.log.message +
      "    " +
      (msg.log.args ? JSON.stringify(msg.log.args) : "")
  );
};

const states = new Array(clients.length).fill(undefined);
const connected = new Array(clients.length).fill(false);

for (const client of clients) {
  client.send({
    type: "call",
    method: "add",
    args: [{ type: "firstChild", parent: "root" }],
  });
}

const server = new Handle("server.ts", 0, [
  "--stateDir",
  stateDir,
  "--port",
  serverPort,
  "--probabilityAuthIssue",
  caseConfig.probability_auth_issue,
]);

const beforeServerUp = Date.now();
while (true) {
  try {
    const resp = await fetch(`http://localhost:${serverPort}/health`);
    if (resp.status === 200) {
      break;
    }
  } catch (e) {}
  await sleep(25);
}
timings.set("serverUp", (Date.now() - beforeServerUp) / 1000);

if (inspectServer) {
  await sleep(1000);
  prompt("Press enter to continue");
}

spawnGlobalStateUpdater();

const beforeConnect = Date.now();
await waitForAllConnected();
timings.set("connect", (Date.now() - beforeConnect) / 1000);

const beforeConverge = Date.now();
await waitForAll((s) => s?.base?.create?.length === clients.length);
await assertConverged();
timings.set("converge", (Date.now() - beforeConverge) / 1000);

console.log("Timings", timings);

const elapsedS = (Date.now() - start) / 1000;
console.log(`All checks passed in ${elapsedS}s!`);

if (inspectServer) {
  prompt("Press enter to quit");
}

server.kill();
for (const client of clients) {
  client.kill();
}
Deno.exit(0);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnGlobalStateUpdater() {
  Promise.all([
    new Promise<void>(async (resolve) => {
      for await (const { line, handle } of server.out) {
        let msg: any;
        try {
          msg = { ...JSON.parse(line), handle };
        } catch (e) {
          doLog({ handle, log: { level: "PASSTHROUGH", message: line } });
          continue;
        }
        switch (msg.type) {
          case "log":
            doLog(msg);
            break;
        }
      }
      resolve();
    }),
    ...clients.map(
      (client) =>
        new Promise<void>(async (resolve) => {
          for await (const { line, handle } of client.out) {
            let msg: any;
            try {
              msg = { ...JSON.parse(line), handle };
            } catch (e) {
              doLog({ handle, log: { level: "PASSTHROUGH", message: line } });
              continue;
            }
            switch (msg.type) {
              case "log":
                doLog(msg);
                break;
              case "inspectResult":
                const id = msg.handle[1];
                if (
                  !(typeof id === "number") ||
                  id < 0 ||
                  id >= states.length
                ) {
                  throw new Error("invalid handle");
                }
                states[id] = msg.persisted;
                connected[id] = msg.status.connected;
                break;
            }
          }
          resolve();
        })
    ),
  ]);
}

async function inspectAll() {
  for (const i in states) {
    states[i] = undefined;
  }

  for (const client of clients) {
    client.send({ type: "inspect" });
  }

  while (states.some((s) => s === undefined)) {
    await sleep(1);
  }
}

async function waitForAll(filter: (s: any) => boolean) {
  for (let i = 0; ; i++) {
    const reached = states.filter(filter).length;
    if (reached === states.length) {
      break;
    }
    if (i % 10 === 0) {
      console.log(`Waiting for ${states.length - reached}/${states.length}`);
    }
    await inspectAll();
    await sleep(100);
  }
  console.log("All connecting");
}

async function waitForAllConnected() {
  for (let i = 0; ; i++) {
    await inspectAll();
    const disconnected = connected.filter((c) => !c).length;
    if (disconnected === 0) {
      break;
    }
    if (i % 100 === 0) {
      console.log(`Waiting for ${disconnected}/${connected.length} to connect`);
    }
    await sleep(10);
  }
  console.log("All connected");
}

async function assertConverged() {
  let serverState: any;
  while (true) {
    const resp = await fetch(
      `http://localhost:${serverPort}/v1/doc?docId=doc`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test",
        },
      }
    );
    if (resp.status !== 200) {
      await sleep(100);
      continue;
    }
    serverState = (await resp.json()).changeset;
    break;
  }

  const clientBases = states.map((s) => s.base);

  const different = clientBases.filter((s) => !equal(s, serverState));
  if (different.length === 0) {
    return;
  }

  const bySer = new Map<string, number>();
  for (const v of different) {
    const ser = stableJSONStringify(v, { space: 2 });
    if (!bySer.has(ser)) {
      bySer.set(ser, 0);
    }
    bySer.set(ser, bySer.get(ser)! + 1);
  }

  try {
    await Deno.remove("./incorrect", { recursive: true });
  } catch (e) {}
  await Deno.mkdir("./incorrect", { recursive: true });

  await Deno.writeTextFile(
    "./incorrect/server.json",
    stableJSONStringify(serverState, { space: 2 })
  );

  let i = 0;
  for (const ser of bySer.keys()) {
    await Deno.writeTextFile(`./incorrect/${i}.json`, ser);
    i++;
  }

  assertEquals;

  throw new AssertionError(
    `${different.length} / ${clients.length} incorrect, ${bySer.size} different incorrect states. Wrote to ./incorrect/`
  );
}
