import { assertEquals } from "std/assert/assert_equals.ts";
import { fakeLatencyTransport } from "./fakeLatencyTransport.ts";
import { Channel, Msg } from "./index.ts";

const basicMsg = () => ({ type: "update", awareness: {} } as const);

Deno.test("recv", async () => {
  const subject = fakeLatencyTransport(
    {
      recv: () => Promise.resolve(basicMsg()),
      recvTimeout: () => Promise.resolve(basicMsg()),
      send: async () => {},
      close: async () => {},
    },
    1
  );
  const msg = await subject.recv();
  assertEquals(msg, basicMsg());
  subject.close();
});

Deno.test("send", async () => {
  const sent = new Channel<Msg>();
  const subject = fakeLatencyTransport(
    {
      recv: () => Promise.resolve(null),
      recvTimeout: () => Promise.resolve(null),
      send: (msg) => sent.send(msg),
      close: async () => {},
    },
    1
  );
  subject.send(basicMsg());
  const sentMsg = await sent.recv();
  assertEquals(sentMsg, basicMsg());
  subject.close();
});
