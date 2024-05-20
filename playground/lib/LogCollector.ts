import { ClientInfo, Logger, ServerUpdateMsg, UpdateMsg } from "@/core";
import { CircuitStatus } from "./PlaygroundNetwork";

export type LogEntry = LogEntryWithoutTs & { ts: number };

type LogEntryWithoutTs = MessageLog | TrafficLog;

type Props = Record<string, unknown>;

export interface MessageLog {
  type: "message";
  component: string;
  level: string;
  message: string;
  props: Props;
}

export interface TrafficLog {
  type: "tx" | "rx";
  circuit: string;
  sender: string;
  receiver: string;
  message: unknown;
}

export default class LogCollector {
  private _tsBase = Date.now();
  private _l: LogEntry[] = [];
  private _onChange = new Set<(log: readonly LogEntry[]) => void>();

  log(): Readonly<Readonly<LogEntry>[]> {
    return [...this._l];
  }

  onChange(cb: (log: Readonly<LogEntry[]>) => void): () => void {
    this._onChange.add(cb);
    return () => this._onChange.delete(cb);
  }

  logger(component: string, props: Props = {}): Logger {
    return new LogCollectorLogger(this, component, props);
  }

  push(msg: LogEntryWithoutTs): void {
    const ts = (Date.now() - this._tsBase) / 1000;
    this._l.push({ ...msg, ts });
    const log = this.log();
    this._triggerChange();
  }

  clear(): void {
    this._l = [];
    this._triggerChange();
  }

  private _triggerChange(): void {
    const log = this.log();
    this._onChange.forEach((cb) => cb(log));
  }
}

class LogCollectorLogger implements Logger {
  private _props: Props;
  private _component: string;
  private _collector: LogCollector;

  constructor(collector: LogCollector, component: string, props: Props) {
    this._collector = collector;
    this._component = component;
    this._props = props;
  }

  debug(msg: string, props?: Props | undefined): void {
    this._collector.push({
      type: "message",
      component: this._component,
      level: "debug",
      message: msg,
      props: { ...this._props, ...props },
    });
  }
  info(msg: string, props?: Props | undefined): void {
    this._collector.push({
      type: "message",
      component: this._component,
      level: "info",
      message: msg,
      props: { ...this._props, ...props },
    });
  }
  warn(msg: string, props?: Props | undefined): void {
    this._collector.push({
      type: "message",
      component: this._component,
      level: "warn",
      message: msg,
      props: { ...this._props, ...props },
    });
  }
  error(msg: string, props?: Props | undefined): void {
    this._collector.push({
      type: "message",
      component: this._component,
      level: "error",
      message: msg,
      props: { ...this._props, ...props },
    });
  }
  child(props: Props): Logger {
    return new LogCollectorLogger(this._collector, this._component, {
      ...this._props,
      ...props,
    });
  }
}

export function filterHeartbeats(log: readonly LogEntry[]): LogEntry[] {
  const awareMap = new Map<string, Readonly<Record<string, unknown>>>();
  const clientsMap = new Map<string, Readonly<ClientInfo[]>>();
  const filtered: LogEntry[] = [];
  for (const entry of log) {
    if (entry.type === "tx" || entry.type === "rx") {
      const key = `${entry.type}-${entry.sender}-${entry.receiver}`;

      let update: UpdateMsg | ServerUpdateMsg | null = null;
      if (
        typeof entry.message === "object" &&
        !!entry.message &&
        "type" in entry.message &&
        (entry.message.type === "update" ||
          entry.message.type === "serverUpdate")
      ) {
        update = entry.message as UpdateMsg | ServerUpdateMsg;
      } else {
        filtered.push(entry);
        continue;
      }

      if (update.type === "update") {
        const prev = awareMap.get(key);
        if (
          !prev ||
          (update.changeset && Object.keys(update.changeset).length > 0) ||
          !awareShallowEq(prev, update.awareness)
        ) {
          filtered.push(entry);
          awareMap.set(key, update.awareness);
          continue;
        } else {
          continue;
        }
      } else if (update.type === "serverUpdate") {
        const prev = clientsMap.get(key);
        if (
          !prev ||
          (update.changeset && Object.keys(update.changeset).length > 0) ||
          !clientsShallowEq(prev, update.clients)
        ) {
          filtered.push(entry);
          clientsMap.set(key, update.clients);
          continue;
        } else {
          continue;
        }
      }
    } else {
      filtered.push(entry);
    }
  }
  return filtered;
}

function awareShallowEq(
  a: Record<string, unknown>,
  b: Record<string, unknown>
) {
  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }
  for (const key in a) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function clientsShallowEq(
  a: Readonly<ClientInfo[]>,
  b: Readonly<ClientInfo[]>
) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      !awareShallowEq(a[i].awareness, b[i].awareness)
    ) {
      return false;
    }
  }
  return true;
}
