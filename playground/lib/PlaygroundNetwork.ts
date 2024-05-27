import { Channel, Msg, ServerDoc, TransportConnecter } from "@/core";
import { waitFor } from "./waitFor";
import LogCollector from "./LogCollector";

export interface CircuitStatus {
  connected: boolean;
  interrupted: boolean;
  disabled: boolean;
}

// TODO: Interrupt then disable then enable doesn't properly reconnect

export class PlaygroundNetwork {
  private _onChange = new Set<() => void>();
  private _c = new Map<string, Circuit>();
  private _disabled = new Set<string>();
  public latencyMs = 0;

  constructor(private _s: ServerDoc, private _l: LogCollector) {}

  connecter(circuit: string): TransportConnecter {
    return async (docId: string) => {
      if (docId !== this._s.id) {
        throw new Error("PlaygroundNetwork only supports one doc");
      }

      if (this._disabled.has(circuit)) {
        this._l.push({
          type: "message",
          component: "PlaygroundNetwork",
          level: "info",
          message: "Connection refused as circuit is disabled",
          props: { circuit },
        });
        return { type: "error" };
      }

      this.disconnect(circuit);
      this._notify();

      await this._latencyDelay();
      const c = new Circuit();
      this._c.set(circuit, c);
      this._notify();

      this._s.connect(
        {
          clientId: "client" + circuit,
          authz: "write",
          user: {
            id: "user" + circuit,
            name: "User " + circuit,
            isAnonymous: false,
          },
        },
        {
          send: (message) => {
            this._l.push({
              type: "tx",
              circuit,
              sender: "server",
              receiver: "client",
              message,
            });
            this._latencyDelay().then(() => c.sendClient(message));
          },
          recv: async () => {
            await this._latencyDelay();
            const message = await c.recvServer();
            this._l.push({
              type: "rx",
              circuit,
              sender: "client",
              receiver: "server",
              message,
            });
            return message;
          },
          recvTimeout: async (timeoutMs) => {
            const start = Date.now();
            await this._latencyDelay();
            if (Date.now() - start > timeoutMs) return undefined;
            const message = await c.recvServer();
            this._l.push({
              type: "rx",
              circuit,
              sender: "client",
              receiver: "server",
              message,
            });
            return message;
          },
          close: () => this._disconnectBy(circuit, "server"),
        }
      );

      return {
        type: "ready",
        transport: {
          send: (message) => {
            this._l.push({
              type: "tx",
              circuit,
              sender: "client",
              receiver: "server",
              message,
            });
            this._latencyDelay().then(() => c.sendServer(message));
          },
          recv: async () => {
            await this._latencyDelay();
            const message = await c.recvClient();
            this._l.push({
              type: "rx",
              circuit,
              sender: "server",
              receiver: "client",
              message,
            });
            return message;
          },
          recvTimeout: async (timeoutMs) => {
            const start = Date.now();
            await this._latencyDelay();
            if (Date.now() - start > timeoutMs) return undefined;
            await this._latencyDelay();
            const message = await c.recvClient();
            this._l.push({
              type: "rx",
              circuit,
              sender: "server",
              receiver: "client",
              message,
            });
            return message;
          },
          close: () => this._disconnectBy(circuit, "client"),
        },
      };
    };
  }

  disconnect(circuit: string) {
    const c = this._c.get(circuit);
    if (!c) return;
    this._c.delete(circuit);
    c.sendClientDisconnectNow();
    c.sendServerDisconnectNow();
    this._notify();
  }

  private async _disconnectBy(circuit: string, by: "client" | "server") {
    const c = this._c.get(circuit);
    if (!c) return;
    this._c.delete(circuit);
    if (by === "client") {
      c.sendClientDisconnectNow();
      this._notify();
      await this._latencyDelay();
      c.sendServerDisconnectNow();
      this._notify();
    } else {
      c.sendServerDisconnectNow();
      this._notify();
      await this._latencyDelay();
      c.sendClientDisconnectNow();
      this._notify();
    }
  }

  interrupt(circuit: string) {
    this._c.get(circuit)?.interrupt();
    this._notify();
  }

  resume(circuit: string) {
    this._c.get(circuit)?.resume();
    this._notify();
  }

  disable(circuit: string) {
    this._disabled.add(circuit);
    this.disconnect(circuit);
    this._notify();
  }

  enable(circuit: string) {
    this._disabled.delete(circuit);
    this._notify();
  }

  listDisabled(): readonly string[] {
    return [...this._disabled];
  }

  status(circuit: string): CircuitStatus {
    const c = this._c.get(circuit);
    return {
      connected: !!c,
      interrupted: !!c && c.interrupted !== null,
      disabled: this._disabled.has(circuit),
    };
  }

  onStatus(circuit: string, cb: (status: CircuitStatus) => void): () => void {
    let prev = this.status(circuit);
    const checker = () => {
      const current = this.status(circuit);
      if (prev !== current) {
        cb(current);
        prev = current;
      }
    };
    this._onChange.add(checker);
    return () => this._onChange.delete(checker);
  }

  private async _latencyDelay() {
    await waitFor(this.latencyMs * randomNormal());
  }

  private _notify() {
    this._onChange.forEach((cb) => cb());
  }
}

class Circuit {
  interrupted: {
    client: (Msg | null)[];
    server: (Msg | null)[];
  } | null = null;
  client = new Channel<Msg | null>();
  server = new Channel<Msg | null>();

  interrupt() {
    if (this.interrupted === null) {
      this.interrupted = {
        client: [],
        server: [],
      };
    }
  }

  resume() {
    if (this.interrupted) {
      const interrupted = this.interrupted;
      this.interrupted = null;
      interrupted.client.forEach((msg) => this.client.send(msg));
      interrupted.server.forEach((msg) => this.server.send(msg));
    }
  }

  sendClient(msg: Msg | null) {
    if (this.interrupted) {
      this.interrupted.client.push(msg);
    } else {
      this.client.send(msg);
    }
  }

  sendServer(msg: Msg | null) {
    if (this.interrupted) {
      this.interrupted.server.push(msg);
    } else {
      this.server.send(msg);
    }
  }

  /** ignores interruption */
  sendClientDisconnectNow() {
    this.client.send(null);
  }

  /** ignores interruption */
  sendServerDisconnectNow() {
    this.server.send(null);
  }

  async recvClient() {
    return await this.client.recv();
  }

  async recvServer() {
    return await this.server.recv();
  }
}

// <https://stackoverflow.com/a/49434653>
function randomNormal() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0) return randomNormal(); // resample between 0 and 1
  return num;
}
