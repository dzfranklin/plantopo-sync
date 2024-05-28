import { Changeset } from "./Changeset.ts";

export interface ServerDocPersistence {
  load(doc: string): Promise<Changeset | null>;
  save(doc: string, changeset: Changeset): Promise<void>;
}

export interface ClientDocSave {
  base: Changeset;
  changes: Changeset;
}

export interface ClientDocPersistence {
  load(doc: string): Promise<ClientDocSave | null>;
  save(doc: string, value: ClientDocSave): Promise<void>;
}

export class InMemoryServerDocPersistence implements ServerDocPersistence {
  private _d = new Map<string, Changeset>();

  constructor(docs: Record<string, Changeset> = {}) {
    for (const doc in docs) {
      this._d.set(doc, docs[doc]);
    }
  }

  load(doc: string): Promise<Changeset | null> {
    return Promise.resolve(this._d.get(doc) ?? null);
  }

  save(doc: string, value: Changeset): Promise<void> {
    this._d.set(doc, value);
    return Promise.resolve();
  }
}

export class InMemoryClientDocPersistence implements ClientDocPersistence {
  private _d = new Map<string, ClientDocSave>();

  load(doc: string): Promise<ClientDocSave | null> {
    return Promise.resolve(this._d.get(doc) ?? null);
  }

  save(doc: string, value: ClientDocSave): Promise<void> {
    this._d.set(doc, value);
    return Promise.resolve();
  }
}
