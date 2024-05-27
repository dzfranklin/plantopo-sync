import {
  Changeset,
  combineChangesets,
  ServerDocPersistence,
  ClientDocPersistence,
  ClientDocSave,
} from "@/core";
import { waitFor } from "./waitFor";
import { emptyChangeset } from "../../core/Changeset";

export class PlaygroundServerDocPersistence implements ServerDocPersistence {
  private _d: Record<string, Changeset[]> = {};
  private _onChange = new Map<string, Set<(changeset: Changeset[]) => void>>();

  public latencyMs = 1;

  constructor(docs: Record<string, Changeset> = {}) {
    for (const doc in docs) {
      this._d[doc] = [docs[doc]];
    }
  }

  async load(doc: string): Promise<Changeset> {
    await waitFor(this.latencyMs);
    return this._d[doc]?.at(-1) ?? emptyChangeset();
  }

  async save(doc: string, changeset: Changeset): Promise<void> {
    await waitFor(this.latencyMs);
    this._d[doc] = [...(this._d[doc] || []), changeset];
    this._onChange.get(doc)?.forEach((cb) => cb(this._d[doc]!));
  }

  get(doc: string): Changeset[] | undefined {
    return this._d[doc];
  }

  onChange(doc: string, cb: (changeset: Changeset[]) => void) {
    if (!this._onChange.has(doc)) {
      this._onChange.set(doc, new Set());
    }
    this._onChange.get(doc)!.add(cb);
    return () => {
      this._onChange.get(doc)?.delete(cb);
    };
  }
}

export class PlaygroundClientDocPersistence implements ClientDocPersistence {
  private _d = new Map<string, ClientDocSave[]>();
  private _onChange = new Map<string, Set<(doc: ClientDocSave[]) => void>>();

  async load(doc: string): Promise<ClientDocSave | null> {
    await waitFor(0);
    return this._d.get(doc)?.at(-1) ?? null;
  }

  async save(doc: string, value: ClientDocSave): Promise<void> {
    await waitFor(0);
    const prev = this._d.get(doc) || [];
    const next = [...prev, value];
    this._d.set(doc, next);
    this._onChange.get(doc)?.forEach((cb) => cb(next));
  }

  get(doc: string): ClientDocSave[] | undefined {
    return this._d.get(doc);
  }

  onChange(doc: string, cb: (doc: ClientDocSave[]) => void) {
    if (!this._onChange.has(doc)) {
      this._onChange.set(doc, new Set());
    }
    this._onChange.get(doc)!.add(cb);
    return () => {
      this._onChange.get(doc)?.delete(cb);
    };
  }
}
