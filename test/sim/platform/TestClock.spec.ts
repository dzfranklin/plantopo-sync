import { assertEquals } from "std/assert/assert_equals.ts";
import { TestClock } from "./TestClock.ts";
import { assert } from "std/assert/assert.ts";

Deno.test("timeout", () => {
  const subject = new TestClock();

  let ran1 = false;
  let ran2 = false;
  subject.timeout(() => {
    ran1 = true;
  }, 1000);
  subject.timeout(() => {
    ran2 = true;
  }, 2000);

  assertEquals(ran1, false);
  assertEquals(ran2, false);

  subject.tick();
  assertEquals(ran1, true);
  assertEquals(ran2, false);

  subject.tick();
  assertEquals(ran2, true);
});

Deno.test("cancelTimeout", () => {
  const subject = new TestClock();

  let ran = false;
  const timeout = subject.timeout(() => {
    ran = true;
  }, 1000);

  subject.cancelTimeout(timeout);
  subject.tick();
  assertEquals(ran, false);
});

Deno.test("interval", () => {
  const subject = new TestClock();

  let ran = 0;
  const interval = subject.interval(() => {
    ran++;
  }, 1);

  assertEquals(ran, 0);

  subject.tick();
  assertEquals(ran, 1);

  subject.tick();
  assertEquals(ran, 2);

  subject.cancelInterval(interval);
  subject.tick();
  assertEquals(ran, 2);
});

Deno.test("every interaction advances time", () => {
  const subject = new TestClock();

  const interactions = [
    () => subject.now(),
    () => subject.timeout(() => {}, 1),
    () => subject.cancelTimeout(1),
    () => subject.interval(() => {}, 1),
    () => subject.cancelInterval(1),
  ];
  for (const interaction of interactions) {
    const before = subject.now();
    interaction();
    const after = subject.now();
    assert(after > before);
  }
});

Deno.test("pending", () => {
  const subject = new TestClock();

  assertEquals(subject.pending(), []);

  subject.timeout(() => {}, 1);
  const pending = subject.pending();

  assertEquals(pending.length, 1);
  assert(pending[0].includes("TestClock.spec.ts"));
});
