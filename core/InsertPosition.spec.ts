import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { InsertPosition, resolveInsertPosition } from "./InsertPosition.ts";
import { docTree } from "./DocTree.spec.ts";
import { ConsoleLogger, Logger, NoopLogger } from "./Logger.ts";
import { Rng, CoreRng } from "./Rng.ts";

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

function logger(): Logger {
  return new ConsoleLogger();
}

function noopLogger(): Logger {
  return new NoopLogger();
}

function rng(): Rng {
  return {
    random() {
      return 0;
    },
  };
}

Deno.test("firstChild with existing", () => {
  const position: InsertPosition = { type: "firstChild", parent: "parent" };
  const got = resolveInsertPosition(logger(), rng(), basicTree, position);
  assertEquals(got, ["parent", "0"]);
});

Deno.test("firstChild of empty", () => {
  const position: InsertPosition = { type: "firstChild", parent: "childA" };
  const got = resolveInsertPosition(logger(), rng(), basicTree, position);
  assertEquals(got, ["childA", "O"]);
});

Deno.test("firstChild of nonexistent", () => {
  const position: InsertPosition = {
    type: "firstChild",
    parent: "nonexistent",
  };
  const got = resolveInsertPosition(noopLogger(), rng(), basicTree, position);
  assertEquals(got, ["root", "0"]);
});
