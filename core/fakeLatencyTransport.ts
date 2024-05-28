import { Clock } from "./Clock.ts";
import { Random } from "./Random/mod.ts";
import { Transport } from "./Transport.ts";

export function fakeLatencyTransport(
  transport: Transport,
  latencyMs: number
): Transport {
  const randomDelay = () => Random.normal() * latencyMs;
  return {
    send: (msg) => {
      Clock.timeout(() => transport.send(msg), randomDelay());
    },
    close: () => transport.close(),
    recv: () =>
      new Promise((resolve) => {
        Clock.timeout(() => resolve(transport.recv()), randomDelay());
      }),
    recvTimeout: (timeoutMs) =>
      new Promise((resolve) => {
        const delay = randomDelay();
        if (delay > timeoutMs) {
          Clock.timeout(() => resolve(undefined), timeoutMs);
        } else {
          Clock.timeout(
            () => resolve(transport.recvTimeout(timeoutMs - delay)),
            delay
          );
        }
      }),
  };
}
