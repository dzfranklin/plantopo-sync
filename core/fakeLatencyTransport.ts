import { Transport } from "./Transport.ts";
import { randomNormal } from "./randomNormal.ts";

export function fakeLatencyTransport(
  transport: Transport,
  latencyMs: number
): Transport {
  const randomDelay = () => randomNormal() * latencyMs;
  return {
    send: (msg) => {
      setTimeout(() => transport.send(msg), randomDelay());
    },
    close: () => transport.close(),
    recv: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(transport.recv()), randomDelay());
      }),
    recvTimeout: (timeoutMs) =>
      new Promise((resolve) => {
        const delay = randomDelay();
        if (delay > timeoutMs) {
          setTimeout(() => resolve(undefined), timeoutMs);
        } else {
          setTimeout(
            () => resolve(transport.recvTimeout(timeoutMs - delay)),
            delay
          );
        }
      }),
  };
}
