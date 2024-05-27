import * as log from "./log.ts";
import { ServerDoc } from "../core/ServerDoc.ts";
import { Logger, ServerDocPersistence } from "../core/index.ts";
import * as prom from "prom-client/";
import { emptyChangeset } from "../core/Changeset.ts";

const openGauge = new prom.Gauge({
  name: "open_docs",
  help: "Number of open documents",
});

export class DocManager {
  private _persistence: ServerDocPersistence;
  private _l: Logger;

  private _loadingDocs = new Map<string, Promise<ServerDoc | null>>();
  private _docs = new Map<string, ServerDoc>();

  constructor(config: { logger: Logger; persistence: ServerDocPersistence }) {
    this._l = config.logger;
    this._persistence = config.persistence;
  }

  async create(docId: string): Promise<void> {
    const existing = await this._persistence.load(docId);
    if (existing) {
      log.info("Skipping create, doc already exists", { docId });
    } else {
      log.info("Creating doc", { docId });
      await this._persistence.save(docId, emptyChangeset());
    }
  }

  get(docId: string): Promise<ServerDoc | null> {
    if (this._docs.has(docId)) {
      return Promise.resolve(this._docs.get(docId)!);
    }

    if (this._loadingDocs.has(docId)) {
      return this._loadingDocs.get(docId)!;
    }

    log.info("Creating ServerDoc", { docId });

    const loadingDoc = ServerDoc.load(
      { logger: this._l, persistence: this._persistence },
      docId
    );
    this._loadingDocs.set(docId, loadingDoc);

    loadingDoc.then((doc) => {
      openGauge.inc();

      this._loadingDocs.delete(docId);
      if (!doc) return;

      this._docs.set(docId, doc);

      doc.onClose(() => {
        openGauge.dec();
        this._docs.delete(docId);
      });
    });

    return loadingDoc;
  }
}
