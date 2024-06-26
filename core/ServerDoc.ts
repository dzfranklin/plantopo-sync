import { ServerDocPersistence } from "./DocPersistence.ts";
import { Changeset, WorkingChangeset, changesetIsEmpty } from "./Changeset.ts";
import { ConsoleLogger, Logger } from "./Logger.ts";
import { DocTree, DocTreeCollector } from "./DocTree.ts";
import { UpdateMsg, ClientInfo } from "./Msg.ts";
import { Transport } from "./Transport.ts";
import compareStrings from "./compareStrings.ts";
import Channel from "./Channel.ts";
import { UserInfo } from "./UserInfo.ts";
import { Clock } from "./Clock.ts";

const sweepInterval = 10_000;
const maxClientQuietPeriod = 30_000;

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
  pendingReplySeq?: number;
  lastRecvAt: number;
}

interface RecvEntry {
  clientId: string;
  msg: UpdateMsg;
}

export class ServerDoc {
  readonly id: string;

  private _closed = false;
  private _onClose = new Set<() => void>();
  private _l: Logger;
  private readonly _p: ServerDocPersistence;
  private _onChange = new Set<() => void>();
  private _c = new Map<string, InternalClientInfo>();
  private _sweepInterval: number;

  private _recv = new Channel<RecvEntry>();
  private _recvDone: Promise<void>;

  private _seq = 0;
  private _data: WorkingChangeset;

  static async load(
    config: ServerDocConfig,
    id: string
  ): Promise<ServerDoc | null> {
    const saved = await config.persistence.load(id);
    if (!saved) return null;
    return new ServerDoc(config, id, saved);
  }

  private constructor(
    config: ServerDocConfig,
    id: string,
    initialState: Changeset
  ) {
    this.id = id;
    this._p = config.persistence;

    const logger = config.logger ?? new ConsoleLogger();
    this._l = logger.child({ doc: this.id });

    this._data = new WorkingChangeset(initialState);

    if (!changesetIsEmpty(initialState)) {
      this._seq = 1;
    }

    this._recvDone = this._doRecv();

    this._sweepInterval = Clock.interval(() => {
      this._sweep();
    }, sweepInterval);
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    for (const client of this._c.values()) {
      client.t.close();
    }
    await this._recvDone;
    Clock.cancelInterval(this._sweepInterval);
    this._l.info("Doc closed");
    this._onClose.forEach((cb) => cb());
  }

  onClose(cb: () => void): () => void {
    this._onClose.add(cb);
    return () => this._onClose.delete(cb);
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
    this._l.info("Connecting client", { clientId });

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
      lastRecvAt: Clock.now(),
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
      this._onTransportClose(clientId);
    };
    recvLoop();

    const clients = this.clients();

    // send intro
    client.t.send({
      type: "serverUpdate",
      seq: this._seq,
      clients,
      changeset: this._data.collect(),
    });

    this._enqueueUpdate();
  }

  disconnect(client: string) {
    this._c.delete(client);
  }

  onChange(cb: (this: ServerDoc) => void): () => void {
    this._onChange.add(cb);
    return () => this._onChange.delete(cb);
  }

  asChangeset(): Changeset {
    return this._data.collect();
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
      if (!client) {
        this._l.debug("Received message from unknown client", { clientId });
        continue;
      }

      client.awareness = msg.awareness;
      client.lastRecvAt = Clock.now();

      let updates: Changeset | undefined;
      if (msg.changeset) {
        if (!msg.seq) {
          this._l.warn("Received changeset without seq", { clientId });
        }

        if (client.authz !== "write") {
          client.t.send({ type: "error", error: "no-write-permission" });
        }

        // update internal state
        client.pendingReplySeq = msg.seq;
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

      this._enqueueUpdate();
    }
  }

  private _sweep() {
    const now = Clock.now();
    for (const client of this._c.values()) {
      if (now - client.lastRecvAt > maxClientQuietPeriod) {
        this._l.info("Timing out client", { clientId: client.id });
        client.t.close();
      }
    }
  }

  private _onTransportClose(clientId: string) {
    this._l.info("Client disconnected", { clientId });
    this._c.delete(clientId);
    if (this._c.size === 0) {
      this.close();
    }
  }

  private _nextUpdate: number | null = null;
  private _lastUpdateSeq = 0;

  private _enqueueUpdate() {
    if (this._nextUpdate !== null) return;
    this._nextUpdate = Clock.timeout(() => {
      this._nextUpdate = null;
      if (this._closed) return;
      if (this._seq === this._lastUpdateSeq) return;

      const clients = this.clients();
      const changes = this._data.collect(this._lastUpdateSeq);
      if (!changesetIsEmpty(changes)) {
        for (const client of this._c.values()) {
          client.t.send({
            type: "serverUpdate",
            seq: this._seq,
            replyTo: client.pendingReplySeq,
            clients: clients.filter((c) => c.id !== client.id),
            changeset: changes,
          });
          client.pendingReplySeq = undefined;
        }
      }
      this._lastUpdateSeq = this._seq;
      this._onChange.forEach((cb) => cb());
    }, 5);
  }
}
