import { ServerDocPersistence } from "./DocPersistence.ts";
import {
  Changeset,
  WorkingChangeset,
  changesetIsEmpty,
  emptyChangeset,
} from "./Changeset.ts";
import { ConsoleLogger, Logger } from "./Logger.ts";
import { DocTree, DocTreeCollector } from "./DocTree.ts";
import { UpdateMsg, ClientInfo } from "./Msg.ts";
import { Transport } from "./Transport.ts";
import compareStrings from "./compareStrings.ts";
import Channel from "./Channel.ts";
import { UserInfo } from "./UserInfo.ts";

// TODO: Reduce message amplification. Maybe move to a tick interval?

// TODO: Add support for images and other external files to protocol

export interface ServerDocConfig {
  persistence: ServerDocPersistence;
  logger?: Logger;
}

interface InternalClientInfo {
  id: string;
  t: Transport;
  authz: "read" | "write";
  user: UserInfo;
  awareness: Record<string, unknown>;
}

interface RecvEntry {
  clientId: string;
  msg: UpdateMsg;
}

export class ServerDoc {
  readonly id: string;

  private _closed = false;
  private _l: Logger;
  private readonly _p: ServerDocPersistence;
  private _onChange = new Set<() => void>();
  private _c = new Map<string, InternalClientInfo>();

  private _recv = new Channel<RecvEntry>();
  private _recvDone: Promise<void>;

  private _seq = 0;
  private _data: WorkingChangeset;

  static async load(config: ServerDocConfig, id: string) {
    const initialState = await config.persistence.load(id);
    return new ServerDoc(config, id, initialState || emptyChangeset());
  }

  private constructor(
    config: ServerDocConfig,
    id: string,
    initialState: Changeset
  ) {
    this.id = id;
    this._p = config.persistence;
    this._l =
      config.logger?.child({ doc: this.id }) ??
      new ConsoleLogger({ doc: this.id });

    this._data = new WorkingChangeset(initialState);

    this._recvDone = this._doRecv();
  }

  async close() {
    this._closed = true;
    for (const client of this._c.values()) {
      client.t.close();
    }
    await this._recvDone;
  }

  connect(
    config: {
      clientId: string;
      authz: "read" | "write";
      user: UserInfo;
    },
    transport: Transport
  ) {
    const clientId = config.clientId;

    if (this._c.has(clientId)) {
      this._l.warn("Client already connected", { clientId });
      return;
    }

    const client: InternalClientInfo = {
      id: clientId,
      t: transport,
      authz: config.authz,
      user: config.user,
      awareness: {},
    };
    this._c.set(clientId, client);

    const recvLoop = async () => {
      while (!this._closed) {
        const msg = await transport.recv();
        if (!msg) break;

        if (msg.type === "update") {
          this._recv.send({ clientId, msg });
        }
      }
      this._onClose(clientId);
    };
    recvLoop();

    const clients = this.clients();

    // send intro
    client.t.send({
      type: "serverUpdate",
      clients,
      changeset: this._data.collect(),
    });

    // broadcast
    const broadcast = {
      type: "serverUpdate",
      clients,
    } as const;
    for (const other of this._c.values()) {
      if (other.id === client.id) continue;
      other.t.send(broadcast);
    }
  }

  disconnect(client: string) {
    this._c.delete(client);
  }

  onChange(cb: (this: ServerDoc) => void): () => void {
    this._onChange.add(cb);
    return () => this._onChange.delete(cb);
  }

  collect(): DocTree {
    const changes = this._data.collect();
    return DocTreeCollector.collect(changes);
  }

  clients(): Readonly<Array<ClientInfo>> {
    return Array.from(this._c.values())
      .map((c) => ({ id: c.id, user: c.user, awareness: c.awareness }))
      .sort((a, b) => compareStrings(a.id, b.id));
  }

  private async _doRecv() {
    while (!this._closed) {
      const recv = await this._recv.recvTimeout(10);
      if (!recv) continue;
      const { clientId, msg } = recv;

      const client = this._c.get(clientId);
      if (!client) return;

      client.awareness = msg.awareness;

      let updates: Changeset | undefined;
      if (msg.changeset) {
        if (!msg.seq) {
          this._l.warn("Received changeset without seq", { clientId });
        }

        // update internal state
        const prevSeq = this._seq;
        this._seq++;
        this._data.changeAuthoritative(msg.changeset, this._seq);
        updates = this._data.collect(prevSeq);
        if (changesetIsEmpty(updates)) {
          updates = undefined;
        }
      }

      // persist
      if (updates) {
        const value = this._data.collect();
        await this._p.save(this.id, value);
      }

      const clients = this.clients();

      const broadcastMsg = {
        type: "serverUpdate",
        clients,
        changeset: updates,
      } as const;

      const replyMsg = {
        ...broadcastMsg,
        replyTo: msg.seq,
      } as const;

      // reply
      client.t.send(replyMsg);

      // broadcast
      for (const other of this._c.values()) {
        if (other.id === clientId) continue;
        other.t.send(broadcastMsg);
      }

      this._triggerOnChange();
    }
  }

  private _onClose(clientId: string) {
    this._c.delete(clientId);
  }

  private _triggerOnChange() {
    this._onChange.forEach((cb) => cb());
  }
}
