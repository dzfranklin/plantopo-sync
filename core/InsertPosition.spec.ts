import { assertEquals } from "std/assert/assert_equals.ts";
import { InsertPosition, resolveInsertPosition } from "./InsertPosition.ts";
import { docTree } from "./DocTree.spec.ts";
import { noopLogger, testLogger, withZeroRng } from "./helpers.spec.ts";

const basicTree = docTree({
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

Deno.test("firstChild with existing", () => {
  const position: InsertPosition = { type: "firstChild", parent: "parent" };
  const got = withZeroRng(() =>
    resolveInsertPosition(testLogger(), basicTree, position)
  );
  assertEquals(got, ["parent", "0"]);
});

Deno.test("firstChild of empty", () => {
  const position: InsertPosition = { type: "firstChild", parent: "childA" };
  const got = withZeroRng(() =>
    resolveInsertPosition(testLogger(), basicTree, position)
  );
  assertEquals(got, ["childA", "O"]);
});

Deno.test("firstChild of nonexistent", () => {
  const position: InsertPosition = {
    type: "firstChild",
    parent: "nonexistent",
  };
  const got = withZeroRng(() =>
    resolveInsertPosition(noopLogger(), basicTree, position)
  );
  assertEquals(got, ["root", "0"]);
});
