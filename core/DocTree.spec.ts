import { Changeset } from "./Changeset.ts";
import { DocTreeCollector, DocTree, DocNode } from "./DocTree.ts";
import { assertEquals } from "std/testing/asserts.ts";
import { changeset } from "./Changeset.spec.ts";

export function docTree(tree: Omit<DocTree, "nodes">): DocTree {
  const nodes: Record<string, DocNode> = {};
  function addNodes(node: DocNode) {
    nodes[node.id] = node;
    for (const child of node.children) {
      addNodes(child);
    }
  }
  addNodes(tree);
  return {
    ...tree,
    nodes,
  };
}

const basicChangeset = changeset({
  create: ["parent", "childA", "childB", "childC"],
  delete: ["childC"],
  property: [
    ["root", "key", "root"],
    ["parent", "key", "parent"],
    ["childA", "key", "childA"],
    ["childB", "key", "childB"],
    ["childC", "key", "childC"],
  ],
  position: [
    ["parent", "root", "A"],
    ["childA", "parent", "A"],
    ["childB", "parent", "B"],
  ],
});

const basicTree: DocTree = docTree({
  id: "root",
  idx: "",
  parent: null,
  props: { key: "root" },
  children: [
    {
      id: "parent",
      idx: "A",
      parent: "root",
      props: { key: "parent" },
      children: [
        {
          id: "childA",
          idx: "A",
          parent: "parent",
          props: { key: "childA" },
          children: [],
        },
        {
          id: "childB",
          idx: "B",
          parent: "parent",
          props: { key: "childB" },
          children: [],
        },
      ],
    },
  ],
});

Deno.test("collect basic", () => {
  const subject = new DocTreeCollector();
  const got = subject.collect(basicChangeset);
  assertEquals(got, basicTree);
});

Deno.test("preserves identify of root", () => {
  const subject = new DocTreeCollector();
  const got1 = subject.collect(basicChangeset);
  const got2 = subject.collect(basicChangeset);
  if (got1 !== got2) {
    throw new Error("Expected identical objects");
  }
});

Deno.test("preserves identify of intermediate", () => {
  const subject = new DocTreeCollector();
  const got1 = subject.collect(
    changeset({
      create: ["parent", "child"],
      position: [
        ["parent", "root", "A"],
        ["child", "parent", "A"],
      ],
    })
  );
  const got2 = subject.collect(
    changeset({
      create: ["parent", "child"],
      property: [["root", "key", "value"]],
      position: [
        ["parent", "root", "A"],
        ["child", "parent", "A"],
      ],
    })
  );
  const parentNode1 = got1.children[0];
  const parentNode2 = got2.children[0];
  if (parentNode1 !== parentNode2) {
    throw new Error("Expected identical parent nodes");
  }

  assertEquals(parentNode1.children.length, 1);
});

Deno.test("updates leaf", () => {
  const subject = new DocTreeCollector();
  const got1 = subject.collect(
    changeset({
      create: ["parent", "child"],
      position: [
        ["parent", "root", "A"],
        ["child", "parent", "A"],
      ],
    })
  );
  const got2 = subject.collect(
    changeset({
      create: ["parent", "child"],
      property: [["child", "key", "value"]],
      position: [
        ["parent", "root", "A"],
        ["child", "parent", "A"],
      ],
    })
  );

  if (got1 === got2) {
    throw new Error("Expected different roots");
  }

  const parentNode1 = got1.children[0];
  const parentNode2 = got2.children[0];
  if (parentNode1 === parentNode2) {
    throw new Error("Expected different parent nodes");
  }

  const childNode1 = parentNode1.children[0];
  const childNode2 = parentNode2.children[0];
  if (childNode1 === childNode2) {
    throw new Error("Expected different child nodes");
  }

  assertEquals(childNode1.props, {});
  assertEquals(childNode2.props, { key: "value" });
});
