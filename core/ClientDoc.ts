import { Logger } from "./Logger.ts";
import { Transport, TransportConnecter } from "./Transport.ts";
import { ConsoleLogger } from "./Logger.ts";
import { DocTree, DocTreeCollector } from "./DocTree.ts";
import {
  Changeset,
  WorkingChangeset,
  changesetIsEmpty,
  collectWorkingChangesets,
} from "./Changeset.ts";
import { InsertPosition, resolveInsertPosition } from "./InsertPosition.ts";
import { ClientInfo, ServerUpdateMsg } from "./Msg.ts";
import { ClientDocPersistence } from "./DocPersistence.ts";
import { Random } from "./index.ts";
import { Clock } from "./Clock.ts";

const tickIntervalMs = 10;
const ticksPerHeartbeat = 1000;

const backoffIntervalMs = 50;
const backoffRate = 2;
const backoffMaxMs = 5 * 60 * 1000; // 5 minutes

export interface ClientDocStatus {
  loaded: boolean;
  connected: boolean;
  unsyncedChanges: number;
}

const initialClientDocStatus: ClientDocStatus = {
  loaded: false,
  connected: false,
  unsyncedChanges: 0,
};

function clientDocStatusEqual(a: ClientDocStatus, b: ClientDocStatus): boolean {
  return (
    a.loaded === b.loaded &&
    a.connected === b.connected &&
    a.unsyncedChanges === b.unsyncedChanges
  );
}

export class ClientDoc {
  readonly docId: string;

  private _nodeIDBase = "nid:" + Random.ulid();

  private _closed = false;
  private _persistenceLoaded = false;
  private _initialTransportLoaded = false;

  private _lastTick = 0;
  private _connectTick = 0;
  private _lastRxTick = 0;

  private _connecter: TransportConnecter;
  private _t:
    | { type: "ready"; t: Transport }
    | { type: "connecting" }
    | {
        type: "closed";
        reconnectingAtUnix: number;
      };
  private _connectFailures = 0;

  private _l: Logger;
  private _persistence: ClientDocPersistence;
  private _onChange = new Set<() => void>();
  private _collector = new DocTreeCollector();
  private _ticker: number;

  private _status = initialClientDocStatus;
  private _onStatusChange = new Set<(status: ClientDocStatus) => void>();
  private _node = 0;
  private _seq = 1;
  private _seqSent = 0;
  private _seqAcked = 0;
  private _base: WorkingChangeset;
  private _changes: WorkingChangeset;
  private _tree = DocTreeCollector.empty();

  private _aware: Record<string, unknown> = {};
  private _onAwareChange = new Set<(aware: Record<string, unknown>) => void>();
  private _hasUnsentAware = true;

  private _peers: ClientInfo[] = [];

  constructor(config: {
    docId: string;
    logger?: Logger;
    transport: TransportConnecter;
    persistence: ClientDocPersistence;
  }) {
    this.docId = config.docId;

    this._l = (config.logger || new ConsoleLogger()).child({
      doc: this.docId,
    });

    this._persistence = config.persistence;

    this._base = new WorkingChangeset(null, this._l.child({ cset: "base" }));
    this._changes = new WorkingChangeset(
      null,
      this._l.child({ cset: "changes" })
    );

    this._persistence
      .load(this.docId)
      .then((save) => {
        this._persistenceLoaded = true;

        if (!save) {
          this._l.info("no save found in persistence");
          return;
        }

        if (!this._initialTransportLoaded) {
          this._l.info("persistence loaded before transport, using base");
          this._base.clear();
          this._base.change(save.base);
        }

        this._changes.change(save.changes, this._seq);
        this._l.info("loaded changes from persistence");

        this._update();
      })
      .catch((err) => {
        this._l.error("load from persistence", { err });
      });

    this._ticker = Clock.interval(() => this._tick(), tickIntervalMs);

    this._connecter = config.transport;
    this.connect();
    this._t = { type: "connecting" };

    this._update();
  }

  close() {
    this._closed = true;
    Clock.cancelInterval(this._ticker);
    if (this._t.type === "ready") {
      this._t.t.close();
    }
  }

  connect() {
    this._connect();
  }

  persistence(): ClientDocPersistence {
    return this._persistence;
  }

  onStatusChange(cb: (status: ClientDocStatus) => void): () => void {
    this._onStatusChange.add(cb);
    return () => this._onStatusChange.delete(cb);
  }

  status(): Readonly<ClientDocStatus> {
    return this._status;
  }

  onAwarenessChange(cb: (aware: Record<string, unknown>) => void): () => void {
    this._onAwareChange.add(cb);
    return () => this._onAwareChange.delete(cb);
  }

  awareness(): Readonly<Record<string, unknown>> {
    return this._aware;
  }

  setAwareness(aware: Record<string, unknown>) {
    this._aware = aware;
    this._hasUnsentAware = true;
    this._onAwareChange.forEach((cb) => cb(this._aware));
  }

  onPeersChange(cb: (peers: ClientInfo[]) => void): () => void {
    this._onChange.add(() => cb(this._peers));
    return () => this._onChange.delete(() => cb(this._peers));
  }

  peers(): Readonly<ClientInfo[]> {
    return this._peers;
  }

  /** Fires when the doc itself (as returned by `.collect()`) changes. */
  onChange(cb: (this: ClientDoc) => void): () => void {
    this._onChange.add(cb);
    return () => this._onChange.delete(cb);
  }

  collect(): Readonly<DocTree> {
    return this._tree;
  }

  set(node: string, key: string, value: unknown) {
    this._change({ property: [[node, key, value]] });
  }

  add(position: InsertPosition): string {
    const id = this._generateNodeId();
    this._change({
      create: [id],
      position: [[id, ...this._resolveInsertPosition(position)]],
    });
    return id;
  }

  move(node: string, position: InsertPosition) {
    this._change({
      position: [[node, ...this._resolveInsertPosition(position)]],
    });
  }

  delete(node: string) {
    this._change({ delete: [node] });
  }

  private async _connect() {
    this._seqSent = this._seqAcked;
    this._t = { type: "connecting" };
    this._update();

    const connectResult = await this._connecter(this.docId);
    if (connectResult.type === "error") {
      this._l.warn("connect error");
      this._connectFailures++;
      this._reconnect();
      return;
    }
    const t = connectResult.transport;
    this._t = { type: "ready", t };
    this._connectTick = this._lastTick;
    this._lastRxTick = this._lastTick;
    this._update();

    const recvLoop = async () => {
      let hasUpdate = false;
      while (!this._closed) {
        const msg = await t.recv();
        if (!msg) {
          this._l.info("disconnected");
          break;
        }

        if (msg.type === "error") {
          this._l.error("received error", { error: msg.error });
          t.close();
          continue;
        }

        if (msg.type === "serverUpdate") {
          this._onServerUpdateMsg(msg, !hasUpdate);

          if (!hasUpdate) {
            hasUpdate = true;
            if (this._connectFailures > 0) {
              this._l.info("clearing connect failures: got update");
              this._connectFailures = 0;
            }
            this._l.info("connected");
          }
        }
      }

      if (!this._closed) {
        this._reconnect();
      }
    };
    recvLoop();
  }

  private _reconnect() {
    const backoffMs = computeBackoffMs(this._connectFailures);
    this._t = {
      type: "closed",
      reconnectingAtUnix: Clock.now() + backoffMs,
    };
    this._l.info("reconnecting in", { backoffMs });
    Clock.timeout(() => this._connect(), backoffMs);
    this._update();
  }

  private _tick() {
    this._lastTick++;
    const tick = this._lastTick;

    if (this._t.type !== "ready") return;
    const t = this._t.t;

    if (
      this._lastRxTick === 0 &&
      tick - this._connectTick > ticksPerHeartbeat
    ) {
      this._l.info("heartbeat timeout, never received");
      t.close();
      return;
    } else if (tick - this._lastRxTick > ticksPerHeartbeat * 1.5) {
      this._l.info("heartbeat timeout");
      t.close();
      return;
    }

    const awareness = this._aware;
    const changeset = this._changes.collect(this._seqSent);

    if (!changesetIsEmpty(changeset)) {
      const seq = this._seq;
      t.send({
        type: "update",
        seq,
        awareness,
        changeset,
      });
      this._seq++;
      this._seqSent = seq;
    } else if (this._hasUnsentAware) {
      t.send({
        type: "update",
        awareness,
      });
    } else if (tick % ticksPerHeartbeat === 0) {
      t.send({
        type: "update",
        awareness,
      });
    }

    this._hasUnsentAware = false;
  }

  private _onServerUpdateMsg(msg: ServerUpdateMsg, isLoad: boolean) {
    this._lastRxTick = this._lastTick;

    if (isLoad) {
      this._base.clear();
    }

    if (msg.changeset) {
      this._base.change(msg.changeset);
    }

    if (msg.replyTo) {
      this._seqAcked = msg.replyTo;
      this._changes.removeChangesBefore(msg.replyTo + 1);
    }

    if (msg.changeset || msg.replyTo) {
      this._persistence.save(this.docId, {
        base: this._base.collect(),
        changes: this._changes.collect(),
      });
    }

    this._peers = [];
    for (const client of msg.clients) {
      this._peers.push(client);
    }

    this._update();
  }

  private _change(cset: Omit<Changeset, "schema">) {
    this._changes.change(cset, this._seq);
    this._persistence.save(this.docId, {
      base: this._base.collect(),
      changes: this._changes.collect(),
    });
    this._update();
  }

  private _prevAwareNotified: Record<string, unknown> | null = null;
  private _prevPeersNotified: ClientInfo[] | null = null;

  private _update() {
    const changes = collectWorkingChangesets([this._base, this._changes]);
    const prevTree = this._tree;
    const newTree = this._collector.collect(changes);
    if (prevTree !== newTree) {
      this._tree = newTree;
      this._onChange.forEach((cb) => cb());
    }

    if (this._aware !== this._prevAwareNotified) {
      this._prevAwareNotified = this._aware;
      const aware = this._aware;
      this._onAwareChange.forEach((cb) => cb(aware));
    }

    if (this._peers !== this._prevPeersNotified) {
      this._prevPeersNotified = this._peers;
      this._onChange.forEach((cb) => cb());
    }

    const status: ClientDocStatus = {
      loaded: this._initialTransportLoaded || this._persistenceLoaded,
      connected: this._t.type === "ready",
      unsyncedChanges: this._changes.size(),
    };
    if (!clientDocStatusEqual(this._status, status)) {
      this._l.debug("status change", { status });
      this._status = status;
      this._onStatusChange.forEach((cb) => cb(status));
    }
  }

  private _resolveInsertPosition(position: InsertPosition): [string, string] {
    return resolveInsertPosition(this._l, this._tree, position);
  }

  private _generateNodeId(): string {
    this._node++;
    return this._nodeIDBase + "." + this._node.toString(36).toUpperCase();
  }
}

function computeBackoffMs(failures: number): number {
  if (failures === 0) return 0;
  const jitter = Math.floor(Random.float() * backoffIntervalMs);
  return Math.min(
    backoffMaxMs,
    backoffIntervalMs * backoffRate ** failures + jitter
  );
}
