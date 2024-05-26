"use client";

import cls from "@/cls";
import ClientPlayground from "./ClientPlayground";
import LogsPlayground from "./LogsPlayground";
import { useEffect, useMemo, useState } from "react";
import LogCollector from "@/lib/LogCollector";
import { Doc, OpenDocConfig, openDoc } from "../../browser";

export default function LocalPlayground() {
  const [state, setState] = useState<{
    logs: LogCollector;
    clientA: Doc;
    clientB: Doc;
  } | null>(null);
  useEffect(() => {
    const logs = new LogCollector();
    const config: OpenDocConfig = {
      endpoint: "ws://localhost:4032/v1/ws",
      token: "local-playground",
      logger: logs.logger("doc"),
    };
    setState({
      logs,
      clientA: openDoc(config, "playground-doc"),
      clientB: openDoc(config, "playground-doc"),
    });
  }, []);

  return (
    <main className="h-screen grid grid-cols-2 grid-rows-[min-content_minmax(0,1fr)_minmax(0,1fr)] p-2">
      <div className="flex col-span-full pb-1 text-sm gap-2">
        <h1 className="mr-auto">Local playground</h1>
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
