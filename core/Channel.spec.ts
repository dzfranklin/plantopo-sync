import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import Channel from "./Channel.ts";

Deno.test("send and recv", async () => {
  const subject = new Channel<number>();

  subject.send(42);
  subject.send(43);

  const got1 = await subject.recv();
  assertEquals(got1, 42);

  const got2 = await subject.recv();
  assertEquals(got2, 43);
});

Deno.test("send to existing recv", async () => {
  const subject = new Channel<number>();

  const recv = subject.recv();

  subject.send(42);

  const got = await recv;
  assertEquals(got, 42);
});

Deno.test("recvTimeout", async () => {
  const subject = new Channel<number>();

  const timedOut = await subject.recvTimeout(10);
  assertEquals(timedOut, undefined);

  subject.send(42);
  const got1 = await subject.recvTimeout(10);
  assertEquals(got1, 42);
});
