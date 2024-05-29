import { Logger, NoopLogger } from "./Logger.ts";
import { Changeset } from "./Msg.ts";
import compareStrings from "./compareStrings.ts";
import { fracIdxBetween } from "./fracIdx.ts";

export type { Changeset } from "./Msg.ts";

// Note this algorithm relies on the fact that JavaScript maps preserve
// insertion order.

export function combineChangesets(a: Changeset, b: Changeset): Changeset {
  if (a.schema !== 0 || b.schema !== 0) throw new Error("Invalid schema");
  const creates = [...(a.create || []), ...(b.create || [])];
  const deletes = [...(a.delete || []), ...(b.delete || [])];
  const props = [...(a.property || []), ...(b.property || [])];
  const positions = [...(a.position || []), ...(b.position || [])];
  const out: Changeset = { schema: 0 };
  if (creates.length > 0) out.create = creates;
  if (deletes.length > 0) out.delete = deletes;
  if (props.length > 0) out.property = props;
  if (positions.length > 0) out.position = positions;
  return out;
}

export function changesetIsEmpty(cset: Changeset): boolean {
  return changesetSize(cset) === 0;
}

export function changesetSize(cset: Changeset): number {
  let size = 0;
  if (cset.create) size += cset.create.length;
  if (cset.delete) size += cset.delete.length;
  if (cset.property) size += cset.property.length;
  if (cset.position) size += cset.position.length;
  return size;
}

export class WorkingChangeset {
  private _l: Logger;

  private _create = new Map<string, number>();
  private _delete = new Map<string, number>();
  private _property = new Map<string, Map<string, [unknown, number]>>();
  /** child -> [parent, idx, meta] */
  private _position = new Map<string, [string, string, number]>();

  constructor(
    base?: Omit<Changeset, "schema"> | null,
    logger: Logger = new NoopLogger()
  ) {
    this._l = logger;
    if (base) {
      this.change(base);
    }
  }

  collect(after?: number): Changeset {
    const creates: string[] = [];
    for (const [obj, meta] of this._create) {
      if (after === undefined || meta > after) {
        creates.push(obj);
      }
    }

    const deletes: string[] = [];
    for (const [obj, meta] of this._delete) {
      if (after === undefined || meta > after) {
        deletes.push(obj);
      }
    }

    const props: [string, string, unknown][] = [];
    for (const [obj, objProps] of this._property) {
      for (const [key, [value, meta]] of objProps) {
        if (after === undefined || meta > after) {
          props.push([obj, key, value]);
        }
      }
    }

    const positions: [string, string, string][] = [];
    for (const [child, [parent, idx, meta]] of this._position) {
      if (after === undefined || meta > after) {
        positions.push([child, parent, idx]);
      }
    }

    const out: Changeset = { schema: 0 };
    if (creates.length > 0) out.create = creates;
    if (deletes.length > 0) out.delete = deletes;
    if (props.length > 0) out.property = props;
    if (positions.length > 0) out.position = positions;
    return out;
  }

  removeChangesBefore(meta: number) {
    for (const [obj, m] of this._create) {
      if (m < meta) {
        this._create.delete(obj);
      }
    }
    for (const [obj, m] of this._delete) {
      if (m < meta) {
        this._delete.delete(obj);
      }
    }
    for (const [_obj, props] of this._property) {
      for (const [key, [_value, m]] of props) {
        if (m < meta) {
          props.delete(key);
        }
      }
    }
    for (const [child, [_parent, _idx, m]] of this._position) {
      if (m < meta) {
        this._position.delete(child);
      }
    }
  }

  clear() {
    this._create.clear();
    this._delete.clear();
    this._property.clear();
    this._position.clear();
  }

  isEmpty(): boolean {
    return (
      this._create.size === 0 &&
      this._delete.size === 0 &&
      this._property.size === 0 &&
      this._position.size === 0
    );
  }

  size(): number {
    let propCount = 0;
    for (const props of this._property.values()) {
      propCount += props.size;
    }
    return (
      this._create.size + this._delete.size + propCount + this._position.size
    );
  }

  change(cset: Omit<Changeset, "schema">, meta: number = 0) {
    this._change(cset, meta, false);
  }

  changeAuthoritative(cset: Omit<Changeset, "schema">, meta: number = 0) {
    this._change(cset, meta, true);
  }

  private _change(
    cset: Omit<Changeset, "schema">,
    meta: number,
    authoritative: boolean
  ) {
    const creates = new Set<string>(cset.create);
    const createPositions = new Map<string, [string, string]>();
    for (const [child, parent, idx] of cset.position || []) {
      if (creates.has(child)) {
        createPositions.set(child, [parent, idx]);
      }
    }

    if (cset.create) {
      for (const obj of cset.create) {
        const pos = createPositions.get(obj);
        if (!pos) {
          this._l.debug("setCreate: no position", { obj });
          continue;
        }
        this._setCreate(obj, pos, meta, authoritative);
      }
    }
    if (cset.delete) {
      for (const obj of cset.delete) {
        this._setDelete(obj, meta);
      }
    }
    if (cset.property) {
      for (const [obj, key, value] of cset.property) {
        this._setProperty(obj, key, value, meta, authoritative);
      }
    }
    if (cset.position) {
      for (const [child, parent, idx] of cset.position) {
        if (creates.has(child)) continue;
        this._setPosition(child, parent, idx, meta, authoritative);
      }
    }
  }

  private _setCreate(
    obj: string,
    [parent, idx]: [string, string],
    meta: number,
    authoritative: boolean
  ) {
    if (this._delete.has(obj)) {
      this._l.debug("setCreate: obj deleted", { obj });
      return;
    }
    if (authoritative) {
      if (parent !== "root" && !this._position.has(parent)) {
        this._l.debug("setCreate: nonexistent parent", { obj, parent });
        return;
      }
    }
    this._create.set(obj, meta);
    this._position.set(obj, [parent, idx, meta]);
  }

  private _setDelete(obj: string, meta: number = 0) {
    if (this._delete.has(obj)) {
      this._l.debug("setDelete: obj already deleted", { obj });
      return;
    }

    this._delete.set(obj, meta);
    this._create.delete(obj);
    this._property.delete(obj);
    this._position.delete(obj);

    for (const child of this._childrenOf(obj)) {
      this._setDelete(child, meta);
    }
  }

  private _setProperty(
    obj: string,
    key: string,
    value: unknown,
    meta: number,
    authoritative: boolean
  ) {
    if (authoritative) {
      if (!this._create.has(obj)) {
        this._l.debug("setProperty: nonexistent obj", { obj });
        return;
      }
    }
    if (!this._property.has(obj)) this._property.set(obj, new Map());
    this._property.get(obj)!.set(key, [value, meta]);
  }

  private _setPosition(
    child: string,
    parent: string,
    idx: string,
    meta: number,
    authoritative: boolean
  ) {
    if (child === "root") {
      this._l.debug("setPosition: root cannot be a child");
      return;
    }
    if (authoritative) {
      if (this._wouldCycle(child, parent)) {
        this._l.debug("setPosition: cycle", { child, parent });
        return;
      }
      if (parent !== "root" && !this._position.has(parent)) {
        this._l.debug("setPosition: nonexistent parent", { child, parent });
        return;
      }
      idx = this._maybeResolveConflictingIdx(child, parent, idx);
    }
    this._position.set(child, [parent, idx, meta]);
  }

  private _wouldCycle(child: string, parent: string): boolean {
    let cursor = parent;
    while (true) {
      if (cursor === child) {
        return true;
      }

      const next = this._position.get(cursor);
      if (!next) {
        return false;
      }
      [cursor] = next;
    }
  }

  private _maybeResolveConflictingIdx(
    child: string,
    parent: string,
    idx: string
  ): string {
    const sibIndices: string[] = [];
    for (const [c, [p, i]] of this._position) {
      if (p === parent && c !== child) {
        sibIndices.push(i);
      }
    }
    sibIndices.sort(compareStrings);

    const spot = sibIndices.indexOf(idx);
    if (spot === -1) {
      return idx;
    }

    const before = sibIndices[spot] ?? "";
    const after = sibIndices[spot + 1] ?? "";
    const resolved = fracIdxBetween(before, after);

    this._l.debug("resolved conflicting idx", { child, parent, idx, resolved });
    return resolved;
  }

  private _childrenOf(parent: string): string[] {
    const children: string[] = [];
    for (const [child, [p]] of this._position) {
      if (p === parent) {
        children.push(child);
      }
    }
    return children;
  }
}

export function collectWorkingChangesets(csets: WorkingChangeset[]): Changeset {
  const base = new WorkingChangeset();
  for (const cset of csets) {
    base.change(cset.collect());
  }
  return base.collect();
}

export function emptyChangeset(): Changeset {
  return { schema: 0 };
}
