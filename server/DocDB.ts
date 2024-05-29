import { Changeset } from "../core/Changeset.ts";
import { ServerDocPersistence } from "../core/index.ts";
import * as prom from "prom-client/";

const loadTimeHistogram = new prom.Histogram({
  name: "doc_load_time_ms",
  help: "Time to load a document in milliseconds",
  buckets: [0, 0.2, 0.4, 0.6, 0.8, 1, 5, 10, 50, 100, 1000],
});

const saveTimeHistogram = new prom.Histogram({
  name: "doc_save_time_ms",
  help: "Time to save a document in milliseconds",
  buckets: [0, 0.2, 0.4, 0.6, 0.8, 1, 5, 10, 50, 100, 1000],
});

const nonexistentDocCounter = new prom.Counter({
  name: "doc_nonexistent_total",
  help: "Total number of requests for nonexistent documents",
});

export class DocDB implements ServerDocPersistence {
  static async open(config: { path: string }): Promise<DocDB> {
    await Deno.mkdir(config.path, { recursive: true });
    const kv = await Deno.openKv(config.path + "/docdb");
    return new DocDB(kv);
  }

  private constructor(private kv: Deno.Kv) {}

  async load(doc: string): Promise<Changeset | null> {
    const start = performance.now();
    const res = await this.kv.get(valueKeyOf(doc));
    loadTimeHistogram.observe(performance.now() - start);

    if (res.value === null) {
      nonexistentDocCounter.inc();
      return null;
    } else {
      return res.value as Changeset;
    }
  }

  async save(doc: string, value: Changeset): Promise<void> {
    const start = performance.now();
    await this.kv.set(valueKeyOf(doc), value);
    saveTimeHistogram.observe(performance.now() - start);
  }
}

function valueKeyOf(doc: string): string[] {
  return ["doc", doc, "value"];
}
