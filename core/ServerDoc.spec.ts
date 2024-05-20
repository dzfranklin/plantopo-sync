import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { Changeset } from "./Changeset.ts";
import { ServerDoc } from "./ServerDoc.ts";
import { InMemoryServerDocPersistence } from "./DocPersistence.ts";
import { UpdateMsg } from "./Msg.ts";

Deno.test("load ServerDoc", async () => {
  const doc = await ServerDoc.load(
    {
      persistence: new InMemoryServerDocPersistence(),
    },
    "doc1"
  );
  assertEquals(doc.id, "doc1");
  await doc.close();
});
