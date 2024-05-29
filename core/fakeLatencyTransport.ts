import { Clock } from "./Clock.ts";
import { Transport } from "./Transport.ts";
import { Channel, Msg, Random } from "./index.ts";

export function fakeLatencyTransport(
  transport: Transport,
  latencyMs: number
): Transport {
  let closed = false;
  const rxQueue = new Channel<Readonly<Msg> | null>();
  (async () => {
    while (!closed) {
      const msg = await transport.recv();
      if (!closed) {
        await Clock.wait(latencyMs * Random.normal());
      }
      rxQueue.send(msg);
      if (msg === null) {
        return;
      }
    }
  })();

  const txQueue = new Channel<Msg | null>();
  (async () => {
    while (!closed) {
      const msg = await txQueue.recv();
      if (!closed) {
        await Clock.wait(latencyMs * Random.normal());
      }
      if (msg === null) {
        transport.close();
        return;
      }
      transport.send(msg);
    }
  })();

  return {
    recv: () => rxQueue.recv(),
    recvTimeout: (ms) => rxQueue.recvTimeout(ms),
    send: (msg) => txQueue.send(msg),
    close: () => {
      closed = true;
      rxQueue.send(null);
      txQueue.send(null);
    },
  };
}
