import { assertEquals } from "std/assert/assert_equals.ts";
import { ServerDoc } from "./ServerDoc.ts";
import { InMemoryServerDocPersistence } from "./DocPersistence.ts";

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
