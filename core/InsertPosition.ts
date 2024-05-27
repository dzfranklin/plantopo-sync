import { DocTree } from "./DocTree.ts";
import { Logger } from "./Logger.ts";
import { fracIdxBetween } from "./fracIdx.ts";

export type InsertPosition =
  | { type: "firstChild"; parent: string }
  | { type: "_force"; parent: string; idx: string };

export function resolveInsertPosition(
  l: Logger,
  tree: DocTree,
  position: InsertPosition
): [string, string] {
  let parent: string | null = null;
  let idx: string | null = null;
  switch (position.type) {
    case "firstChild": {
      const parentNode = tree.nodes[position.parent];
      if (!parentNode) break;

      parent = parentNode.id;
      idx = fracIdxBetween("", parentNode.children[0]?.idx ?? "");
      break;
    }
    case "_force": {
      parent = position.parent;
      idx = position.idx;
      break;
    }
  }

  if (parent === null || idx === null) {
    l.warn("invalid insert position", { position });
    return ["root", fracIdxBetween("", tree.nodes.root.children[0]?.idx ?? "")];
  } else {
    return [parent, idx];
  }
}
