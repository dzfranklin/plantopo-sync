"use client";

import cls from "@/cls";
import ClientPlayground from "./ClientPlayground";
import ServerPlayground from "./ServerPlayground";
import { useEffect, useState } from "react";
import { ClientDoc, ServerDoc } from "@/core";
import LogsPlayground from "./LogsPlayground";
import LogCollector from "@/lib/LogCollector";
import {
  PlaygroundClientDocPersistence,
  PlaygroundServerDocPersistence,
} from "@/lib/PlaygroundPersistence";
import Button from "./Button";
import { PlaygroundNetwork } from "@/lib/PlaygroundNetwork";

interface Actors {
  network: PlaygroundNetwork;
  clientA: ClientDoc;
  clientB: ClientDoc;
  server: ServerDoc;
  logs: LogCollector;
  aPersistence: PlaygroundClientDocPersistence;
  bPersistence: PlaygroundClientDocPersistence;
  serverPersistence: PlaygroundServerDocPersistence;
}

export default function Playground() {
  const [actors, _setActors] = useState<Actors | null>(null);
  const setActors = (actors: Actors | null) => {
    (window as any).actors = actors;
    console.log("set window.actors");
    _setActors(actors);
  };
  useEffect(() => {
    createActors().then(setActors);
  }, []);

  const [latencyMs, setLatencyMs] = useState(10);
  useEffect(() => {
    if (!actors?.network) return;
    actors.network.latencyMs = latencyMs;
  }, [actors?.network, latencyMs]);

  return (
    <main className="h-screen grid grid-cols-2 grid-rows-[min-content_minmax(0,1fr)_minmax(0,1fr)] p-2">
      <div className="flex col-span-full pb-1 text-sm gap-2">
        <h1 className="mr-auto">Simulated playground</h1>
        <label className="mx-6">
          <input
            type="number"
            value={latencyMs}
            onChange={(e) => setLatencyMs(+e.target.value)}
            className="mr-1 w-14 text-right border rounded-sm border-gray-300 px-1"
          />
          ms median latency
        </label>

        <Button
          small
          onClick={() => {
            setActors(null);
            createActors().then(setActors);
          }}
        >
          Reset
        </Button>
        <Button
          small
          disabled={!actors}
          onClick={() => {
            if (!actors) return;
            setActors(null);
            createActors(actors).then(setActors);
          }}
        >
          Reload from persistence
        </Button>
      </div>
      <PlaygroundPane>
        {actors && (
          <ClientPlayground
            circuit="A"
            doc={actors.clientA}
            network={actors.network}
          />
        )}
      </PlaygroundPane>
      <PlaygroundPane>
        {actors && (
          <ClientPlayground
            circuit="B"
            doc={actors.clientB}
            network={actors.network}
          />
        )}
      </PlaygroundPane>
      <PlaygroundPane>
        {actors && (
          <ServerPlayground
            doc={actors.server}
            persistence={actors.serverPersistence}
          />
        )}
      </PlaygroundPane>
      <PlaygroundPane>
        {actors && <LogsPlayground collector={actors.logs} />}
      </PlaygroundPane>
    </main>
  );
}

function PlaygroundPane({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cls("h-full border overflow-scroll", className)}>
      {children}
    </div>
  );
}

async function createActors(prev?: Actors): Promise<Actors> {
  if (prev) {
    prev.clientA.close();
    prev.clientB.close();
    prev.server.close();
  }

  let logs: LogCollector;
  if (prev?.logs) {
    logs = prev.logs;
    logs.clear();
  } else {
    logs = new LogCollector();
  }

  let aPersistence: PlaygroundClientDocPersistence;
  let bPersistence: PlaygroundClientDocPersistence;
  let serverPersistence: PlaygroundServerDocPersistence;
  if (prev) {
    aPersistence = prev.aPersistence;
    bPersistence = prev.bPersistence;
    serverPersistence = prev.serverPersistence;
  } else {
    aPersistence = new PlaygroundClientDocPersistence();
    bPersistence = new PlaygroundClientDocPersistence();
    serverPersistence = new PlaygroundServerDocPersistence();
  }

  const server = (await ServerDoc.load(
    {
      persistence: serverPersistence,
      logger: logs.logger("ServerDoc"),
    },
    "doc1"
  ))!;

  const network = new PlaygroundNetwork(server, logs);
  if (prev) {
    for (const circuit of prev.network.listDisabled()) {
      network.disable(circuit);
    }
  }

  const clientA = new ClientDoc({
    clientId: "clientA",
    docId: "doc1",
    transport: network.connecter("A"),
    logger: logs.logger("ClientADoc"),
    persistence: aPersistence,
  });
  const clientB = new ClientDoc({
    clientId: "clientB",
    docId: "doc1",
    transport: network.connecter("B"),
    logger: logs.logger("ClientBDoc"),
    persistence: bPersistence,
  });

  return {
    network,
    clientA,
    aPersistence,
    clientB,
    bPersistence,
    server,
    serverPersistence,
    logs,
  };
}
