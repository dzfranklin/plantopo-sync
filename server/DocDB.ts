import { Changeset } from "../core/Changeset.ts";
import { ServerDocPersistence } from "../core/index.ts";

export class DocDB implements ServerDocPersistence {
  static async open(config: { path: string }): Promise<DocDB> {
    const kv = await Deno.openKv(config.path);
    return new DocDB(kv);
  }

  private constructor(private kv: Deno.Kv) {}

  async load(doc: string): Promise<Changeset | null> {
    const res = await this.kv.get(valueKeyOf(doc));
    if (res.value === null) {
      return null;
    } else {
      return res.value as Changeset;
    }
  }

  async save(doc: string, value: Changeset): Promise<void> {
    await this.kv.set(valueKeyOf(doc), value);
  }
}

function valueKeyOf(doc: string): string[] {
  return ["doc", doc, "value"];
}
