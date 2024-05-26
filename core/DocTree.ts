import { Changeset } from "./Changeset.ts";
import compareStrings from "./compareStrings.ts";

export type DocTree = {
  id: "root";
  parent: null;
  idx: "";
  props: DocNode["props"];
  children: DocNode["children"];
  nodes: Record<string, DocNode>;
};

export interface DocNode {
  id: string;
  parent: string | null;
  idx: string;
  props: Record<string, unknown>;
  children: DocNode[];
}

interface WorkingNode {
  children: string[];
  node: DocNode;
}

export class DocTreeCollector {
  private _cache = new Map<string, DocNode | DocTree>();

  static empty(): DocTree {
    return new DocTreeCollector().collect({ schema: 0 });
  }

  /** Collect a changeset into a DocTree
   *
   * If a node is unchanged from the previous call to collect then the same
   * object will be returned. This enables efficient diffing.
   */
  collect(cset: Changeset): DocTree {
    return collectChangesetToDocTree(this._cache, cset);
  }

  static collect(cset: Changeset): DocTree {
    return new DocTreeCollector().collect(cset);
  }
}

function collectChangesetToDocTree(
  cache: Map<string, DocNode>,
  cset: Changeset
): DocTree {
  const workingNodes = prepareWorkingNodes(cset);

  // prevent unbounded growth
  for (const id of cache.keys()) {
    if (!workingNodes.has(id)) {
      cache.delete(id);
    }
  }

  return buildNode(cache, workingNodes, "root") as DocTree;
}

function buildNode(
  cache: Map<string, DocNode>,
  workingNodes: Map<string, WorkingNode>,
  id: string
): DocNode | DocTree {
  const working = workingNodes.get(id);
  if (!working) throw new Error(`Missing working node ${id}`);
  const node = working.node;

  node.children = working.children.map((child) =>
    buildNode(cache, workingNodes, child)
  );

  const cached = cache.get(id);
  if (
    cached &&
    node.parent === cached.parent &&
    node.idx === cached.idx &&
    recordShallowEq(node.props, cached.props) &&
    arrayShallowEq(node.children, cached.children)
  ) {
    return cached;
  }

  if (id === "root") {
    const nodes: Record<string, DocNode> = {};
    for (const node of workingNodes.values()) {
      nodes[node.node.id] = node.node;
    }

    const partial = node as Omit<DocTree, "nodes">;
    const tree: DocTree = { ...partial, nodes };

    cache.set(id, tree);
    return tree;
  } else {
    cache.set(id, node);
    return node;
  }
}

function prepareWorkingNodes(cset: Changeset): Map<string, WorkingNode> {
  const workingNodes = new Map<string, Partial<WorkingNode>>();

  for (const id of cset.create || []) {
    workingNodes.set(id, {
      children: [],
      node: { id, idx: "TEMP", parent: null, children: [], props: {} },
    });
  }
  for (const oid of cset.delete || []) {
    workingNodes.delete(oid);
  }
  workingNodes.set("root", {
    children: [],
    node: { id: "root", idx: "", parent: null, children: [], props: {} },
  });

  for (const [oid, key, value] of cset.property || []) {
    const node = workingNodes.get(oid);
    if (!node) continue;
    node.node!.props[key] = value;
  }

  const missingParents = new Set(workingNodes.keys());
  missingParents.delete("root");

  const childIndices = new Map<string, Map<string, string>>();
  for (const [childId, parentId, idx] of cset.position || []) {
    if (childId === "root") continue;

    const node = workingNodes.get(childId);
    if (!node) continue;

    missingParents.delete(childId);

    node.node!.parent = parentId;
    node.node!.idx = idx;

    const parent = childIndices.get(parentId) ?? new Map<string, string>();
    parent.set(childId, idx);
    childIndices.set(parentId, parent);
  }
  for (const [parentId, childMap] of childIndices) {
    const parentNode = workingNodes.get(parentId);
    if (!parentNode) continue;

    const children = Array.from(childMap.entries())
      .sort(([_a, a], [_b, b]) => compareStrings(a, b))
      .map(([id]) => id);

    parentNode.children = children;
  }
  for (const id of missingParents) {
    workingNodes.delete(id);
  }

  return workingNodes as Map<string, WorkingNode>;
}

function recordShallowEq(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (const key in a) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function arrayShallowEq(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (const idx in a) {
    if (a[idx] !== b[idx]) return false;
  }
  return true;
}
