import { Random, Transport } from "../core/index.ts";

export class Tracer {
  private run = Random.ulid();
  private i = 0;
  private base = performance.now();
  private pending = new Map<number, Promise<void>>();

  static async open(path: string): Promise<Tracer> {
    await Deno.mkdir(path, { recursive: true });
    const db = await Deno.openKv(path + "/trace.db");
    return new Tracer(db);
  }

  private constructor(private db: Deno.Kv) {}

  async close() {
    await Promise.all(this.pending);
    this.db.close();
  }

  wrap(clientId: string, t: Transport): Transport {
    return {
      send: (msg) => {
        this._on("send", clientId, msg);
        t.send(msg);
      },
      close: () => {
        this._on("close", clientId);
        t.close();
      },
      recv: async () => {
        const msg = await t.recv();
        this._on("recv", clientId, msg);
        return msg;
      },
      recvTimeout: async (timeoutMs) => {
        const msg = await t.recvTimeout(timeoutMs);
        this._on("recvTimeout", clientId, msg);
        return msg;
      },
    };
  }

  _on(type: string, clientId: string, msg?: unknown) {
    const i = this.i;
    const p = this.db
      .set([this.run, i], {
        elapsed: performance.now() - this.base,
        clientId,
        type,
        msg,
      })
      .then(() => {
        this.pending.delete(i);
      });
    this.pending.set(i, p);
    this.i++;
  }

  static async dump(path: string, outPath: string) {
    const db = await Deno.openKv(path);
    const out = new Map<string, unknown[]>();
    const entries = db.list({ prefix: [] });
    for await (const entry of entries) {
      const [run] = entry.key as [string, number];
      if (!out.has(run)) {
        out.set(run, []);
      }
      const events = out.get(run)!;
      events.push(entry.value);
    }

    for (const [run, events] of out) {
      const lines = events.map((e) => JSON.stringify(e)).join("\n");
      await Deno.writeTextFile(outPath + "/" + run + ".ndjson", lines);
    }
  }
}
