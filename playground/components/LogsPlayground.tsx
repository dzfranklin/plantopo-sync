import LogCollector, {
  LogEntry,
  MessageLog,
  TrafficLog,
  filterHeartbeats,
} from "@/lib/LogCollector";
import { useEffect, useRef, useState } from "react";
import { JSONComponent } from "./JSONComponent";
import Button from "./Button";

export default function LogsPlayground({
  collector,
}: {
  collector: LogCollector;
}) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [hideHeartbeats, setHideHeartbeats] = useState(false);

  const [fullLog, setFullLog] = useState<readonly LogEntry[]>(() =>
    collector.log()
  );
  useEffect(() => collector.onChange(setFullLog), [collector]);

  const log = hideHeartbeats ? filterHeartbeats(fullLog) : fullLog;

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !autoScroll) return;
    const observer = new ResizeObserver(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [log, autoScroll]);

  function downloadTrace() {
    const lines: string[] = [];
    for (const entry of fullLog) {
      if (entry.type === "rx") {
        lines.push(
          JSON.stringify({
            circuit: entry.circuit,
            rx: entry.receiver,
            msg: entry.message,
          })
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    document.body.appendChild(el);
    el.href = url;
    const now = new Date();
    el.download = `trace_${now.getFullYear()}_${(now.getMonth() + 1)
      .toString()
      .padStart(2, "0")}_${now.getDate().toString().padStart(2, "0")}.ndjson`;
    el.click();
    URL.revokeObjectURL(url);
    el.remove();
  }

  return (
    <div ref={ref} className="h-full overflow-auto">
      <div className="sticky top-0 flex gap-4 p-1 bg-white text-xs items-baseline">
        <Button onClick={downloadTrace} small>
          Download trace
        </Button>

        <label className="ml-auto">
          <input
            className="mr-1"
            type="checkbox"
            checked={hideHeartbeats}
            onChange={(e) => setHideHeartbeats(e.target.checked)}
          />
          Hide heartbeats
        </label>

        <label>
          <input
            className="mr-1"
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto scroll
        </label>

        <Button onClick={() => collector.clear()} small>
          Clear
        </Button>
      </div>
      <ul>
        {log.map((entry, i) => (
          <EntryComponent key={i} entry={entry} i={i} />
        ))}
      </ul>
    </div>
  );
}

function EntryComponent({ entry, i }: { entry: LogEntry; i: number }) {
  switch (entry.type) {
    case "message":
      return <MessageComponent entry={entry} i={i} />;
    case "tx":
    case "rx":
      return <TrafficComponent entry={entry} i={i} />;
    default:
      return null;
  }
}

function MessageComponent({
  entry,
  i,
}: {
  entry: MessageLog & { ts: number };
  i: number;
}) {
  return (
    <EntryComponentBase
      i={i}
      entry={entry}
      details={
        <>
          <div className="text-sm">{entry.message}</div>
          <JSONComponent value={entry.props} />
        </>
      }
    >
      <span>{entry.component}</span>
      <span>{entry.level}</span>
      <span className="truncate">{entry.message}</span>
      <div className="ml-auto truncate shrink">
        {Object.keys(entry.props).length > 0 && (
          <JSONComponent value={entry.props} oneLine />
        )}
      </div>
    </EntryComponentBase>
  );
}

function TrafficComponent({
  entry,
  i,
}: {
  entry: TrafficLog & { ts: number };
  i: number;
}) {
  return (
    <EntryComponentBase
      i={i}
      entry={entry}
      details={<JSONComponent value={entry.message} />}
    >
      <span>{entry.circuit}</span>
      {entry.type === "tx" ? (
        <span>
          TX {entry.sender} &rarr; {entry.receiver}
        </span>
      ) : (
        <span>
          RX {entry.receiver} &larr; {entry.sender}
        </span>
      )}
    </EntryComponentBase>
  );
}

function EntryComponentBase({
  i,
  entry,
  children,
  details,
}: {
  i: number;
  entry: Readonly<LogEntry>;
  children: React.ReactNode[];
  details?: React.ReactNode;
}) {
  return (
    <li className="border-b border-gray-200">
      <details>
        <summary className="ml-2 hover:bg-gray-100">
          <EntryHeader i={i} ts={entry.ts}>
            {children}
          </EntryHeader>
        </summary>

        <div className="ml-2 my-1 mr-1">{details}</div>
      </details>
    </li>
  );
}

function EntryHeader({
  children,
  i,
  ts,
}: {
  i: number;
  ts: number;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm inline-flex w-[calc(100%-2rem)] gap-1 overflow-auto align-baseline">
      <EntryNumber i={i} />
      <span className="text-gray-400 text-xs">{ts.toFixed(3)}</span>
      {children}
    </div>
  );
}

function EntryNumber({ i }: { i: number }) {
  return (
    <div className="h-5 w-5 flex-shrink-0 flex items-center justify-center">
      <span className="text-gray-400 text-xs">{i}</span>
    </div>
  );
}
