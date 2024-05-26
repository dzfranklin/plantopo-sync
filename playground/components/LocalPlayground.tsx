"use client";

import cls from "@/cls";
import ClientPlayground from "./ClientPlayground";
import LogsPlayground from "./LogsPlayground";
import { useEffect, useMemo, useState } from "react";
import LogCollector from "@/lib/LogCollector";
import { Doc, OpenDocConfig, openDoc } from "../../browser";
import Button from "./Button";

export default function LocalPlayground() {
  const logs = useMemo(() => new LogCollector(), []);
  const [docId, setDocId] = useState<string>("playground-doc");

  const [state, setState] = useState<{
    logs: LogCollector;
    clientA: Doc;
    clientB: Doc;
  } | null>(null);
  useEffect(() => {
    const config: OpenDocConfig = {
      endpoint: "ws://localhost:4032/v1/ws",
      token: "local-playground",
      logger: logs.logger("doc"),
    };
    const clientA = openDoc(config, docId);
    const clientB = openDoc(config, docId);
    setState({
      logs,
      clientA,
      clientB,
    });
    return () => {
      clientA.close();
      clientB.close();
    };
  }, [docId, logs]);

  return (
    <main className="h-screen grid grid-cols-2 grid-rows-[min-content_minmax(0,1fr)_minmax(0,1fr)] p-2">
      <div className="flex col-span-full pb-1 text-sm gap-2">
        <h1 className="mr-auto">Local playground</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDocId(e.currentTarget.docId.value);
          }}
        >
          <label>
            Doc ID:
            <input
              type="text"
              name="docId"
              defaultValue={docId}
              className="border rounded-sm px-1 py-0.5"
            />
          </label>
          <Button type="submit">Open</Button>
        </form>
      </div>

      <PlaygroundPane>
        {state && <ClientPlayground circuit="A" doc={state.clientA} />}
      </PlaygroundPane>
      <PlaygroundPane>
        {state && <ClientPlayground circuit="B" doc={state.clientB} />}
      </PlaygroundPane>
      <PlaygroundPane></PlaygroundPane>
      <PlaygroundPane>
        {state && <LogsPlayground collector={state.logs} />}
      </PlaygroundPane>
    </main>
  );
}

function PlaygroundPane({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cls("h-full border overflow-scroll", className)}>
      {children}
    </div>
  );
}
