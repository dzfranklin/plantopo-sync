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
import { DocGetResponse } from "../../server/handlers/doc/handleDocGet.ts";
import { changesetIsEmpty } from "../../core/Changeset.ts";

let disableRegularLogs = false;

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

const args = parseArgs(Deno.args);

if (args.untilFailure) {
  for (let run = 0; ; run++) {
    let start = Date.now();
    const p = Deno.run({
      cmd: [
        import.meta.filename!,
        ...Deno.args.filter((a) => a !== "--untilFailure"),
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const [status, stdout, stderr] = await Promise.all([
      p.status(),
      p.output(),
      p.stderrOutput(),
    ]);
    p.close();
    console.log(`Run ${run + 1} in ${(Date.now() - start) / 1000}s`);
    if (!status.success) {
      Deno.stdout.writeSync(stdout);
      Deno.stderr.writeSync(stderr);
      console.log("Failed after ", run + 1, " runs");
      Deno.exit(1);
    }
  }
}

const serverPort = args.serverPort || "4100";

export const inspectServer = args.inspectServer || false;

const defaultCaseConfig = {
  clients: 10,
  probability_auth_issue: 0.1,
  disable_fake_latency: false,
  seed: 42,
};

const caseName = args._[0];
const casePath = import.meta.dirname + "/cases/" + caseName + ".yaml";
const caseConfig = {
  ...defaultCaseConfig,
  ...yaml.parse(await Deno.readTextFile(casePath)),
};

if ("seed" in args) {
  caseConfig.seed = args.seed;
}

console.log(caseConfig);

const rng = new PGCSource(0, caseConfig.seed, 0, 54);
Random.__debugSetGlobal(rng);

let timings = new Map<string, number>();

const stateDir = await Deno.makeTempDir();
console.log("stateDir", stateDir);

const clients = new Array(caseConfig.clients).fill(null).map(
  (_, i) =>
    new Handle("client.ts", i, [
      "--serverPort",
      serverPort,
      "--id",
      i.toString(),
      "--seed",
      (caseConfig.seed + i).toString(),
      ...(caseConfig.disable_fake_latency ? ["--disableFakeLatency"] : []),
      "--initialState",
      JSON.stringify(
        i === 0
          ? {
              changes: {
                schema: 0,
                property: [["root", "unsynced-in-initial-0", 42]],
              },
            }
          : null
      ),
    ])
);
console.log("Initialized clients");

const doLog = (msg: any) => {
  let impl: (...args: any[]) => void;
  switch (msg.log.level) {
    case "DEBUG":
      if (disableRegularLogs) return;
      impl = log.debug;
      break;
    case "INFO":
      if (disableRegularLogs) return;
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

for (let i = 0; i < Math.floor(clients.length / 2); i++) {
  clients[i].send({
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
  "--seed",
  caseConfig.seed,
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

let failure: any = null;
try {
  const beforeConnect = Date.now();
  await waitForAllConnected();
  timings.set("connect", (Date.now() - beforeConnect) / 1000);

  for (let i = Math.floor(clients.length / 2); i < clients.length; i++) {
    clients[i].send({
      type: "call",
      method: "add",
      args: [{ type: "firstChild", parent: "root" }],
    });
  }

  const beforeConverge = Date.now();
  await awaitConverged(
    10_000,
    (serverState) => serverState.doc.children.length === clients.length
  );
  timings.set("converge", (Date.now() - beforeConverge) / 1000);

  // Check final state

  const finalServerState = await fetchServerState();

  if (clients.length > 0) {
    assertEquals(finalServerState.doc.props, {
      "unsynced-in-initial-0": 42,
    });
  }

  const indices = new Set();
  for (const node of finalServerState.doc.children) {
    if (indices.has(node.idx)) {
      throw new Error("duplicate index");
    }
    indices.add(node.idx);
  }
} catch (err) {
  failure = err;
} finally {
  disableRegularLogs = true;

  await server.quit();

  console.log("Trace written to ", stateDir + "/trace.db");
  console.log("Timings", timings);

  const elapsedS = (Date.now() - start) / 1000;
  console.log(`Took ${elapsedS}s`);

  if (inspectServer) {
    prompt("Press enter to quit");
  }

  for (const client of clients) {
    client.quit();
  }

  if (failure !== null) {
    throw failure;
  } else {
    console.log("Success");
  }
}

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
  console.log("All connected");
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

async function fetchServerState(): Promise<DocGetResponse> {
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
    return await resp.json();
  }
}

async function awaitConverged(
  timeoutMs: number,
  serverPredicate: (serverState: DocGetResponse) => boolean
) {
  const start = Date.now();
  for (let i = 0; ; i++) {
    const serverState = await fetchServerState();
    if (serverPredicate(serverState) && isConverged(serverState)) {
      return;
    }
    if (Date.now() - start > timeoutMs) {
      console.log("Did not converge within ", timeoutMs / 1000, "s");
      if (!serverPredicate(serverState)) {
        throw new AssertionError(
          "Server did not reach expected state (per predicate)"
        );
      }
      await assertConverged(serverState);
    }
    if (i === 0) {
      console.log("Waiting for convergence");
    }
    await inspectAll();
    await sleep(100);
  }
}

async function assertConverged(serverState: any) {
  if (isConverged(serverState)) {
    return true;
  }

  const outDir = "/tmp/convergence_failure";
  try {
    await Deno.remove(outDir, { recursive: true });
  } catch (e) {}
  await Deno.mkdir(outDir, { recursive: true });
  await Deno.writeTextFile(
    outDir + "/server.json",
    stableJSONStringify(serverState.changeset, { space: 2 })
  );
  for (const client of states) {
    await Deno.writeTextFile(
      outDir + "/client-" + client + ".json",
      stableJSONStringify(states[client], { space: 2 })
    );
  }
  throw new AssertionError(`Convergence failure, see ${outDir} for details`);
}

function isConverged(serverState: any) {
  if (
    states.every(
      (s) => equal(s.base, serverState.changeset) && changesetIsEmpty(s.changes)
    )
  ) {
    return true;
  }
}
