import * as log from "./log.ts";
import { ServerDoc, ServerDocConfig } from "../core/ServerDoc.ts";

export class DocManager {
  private _docConfig: ServerDocConfig;

  private _docs = new Map<string, Promise<ServerDoc>>();

  constructor(config: { doc: ServerDocConfig }) {
    this._docConfig = config.doc;
  }

  public get(docId: string): Promise<ServerDoc> {
    let doc = this._docs.get(docId);
    if (!doc) {
      log.info("Creating ServerDoc", { docId });
      doc = ServerDoc.load(this._docConfig, docId);
      this._docs.set(docId, doc);
    }
    return doc;
  }

  public closeDoc(docId: string) {
    const doc = this._docs.get(docId);
    if (!doc) return;
    log.info("Closing ServerDoc", { docId });
    this._docs.delete(docId);
    doc.then((d) => d.close());
  }
}
