import { Authenticator } from "./Authenticator.ts";
import { Authorizer } from "./Authorizer.ts";
import * as log from "./log.ts";
import { ServerDoc, ServerDocConfig } from "../core/ServerDoc.ts";

export class DocManager {
  private _docConfig: ServerDocConfig;

  private _docs = new Map<string, ServerDoc>();

  constructor(config: { doc: ServerDocConfig }) {
    this._docConfig = config.doc;
  }

  public async get(docId: string): Promise<ServerDoc> {
    let doc = this._docs.get(docId);
    if (!doc) {
      log.info("Creating ServerDoc", { docId });
      doc = await ServerDoc.load(this._docConfig, docId);
      this._docs.set(docId, doc);
    }
    return doc;
  }

  public closeDoc(docId: string) {
    const doc = this._docs.get(docId);
    if (!doc) return;
    this._docs.delete(docId);
    doc.close();
  }
}
