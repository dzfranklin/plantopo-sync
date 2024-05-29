import Channel from "./Channel.ts";
import { Logger } from "./Logger.ts";
import { Msg, MsgSchema } from "./Msg.ts";
import { Transport } from "./Transport.ts";

export function wsTransport(
  socket: WebSocket,
  logger: Logger
): Promise<Transport<Msg | null>> {
  let opened = false;
  return new Promise((resolve, reject) => {
    const inbound = new Channel<Msg | null>();
    socket.addEventListener("open", () => {
      opened = true;

      socket.addEventListener("message", (event) => {
        try {
          const msg = MsgSchema.parse(JSON.parse(event.data));
          inbound.send(msg);
        } catch (e) {
          logger.error("Failed to parse message", { error: e.message });
          socket.close();
        }
      });

      socket.addEventListener("close", () => {
        inbound.send(null);
      });

      resolve({
        send: (msg) => {
          if (socket.readyState !== WebSocket.OPEN) {
            logger.debug("WebSocket not open, dropping message", {
              type: msg?.type,
            });
            return;
          }
          socket.send(JSON.stringify(msg));
        },
        recv: () => inbound.recv(),
        recvTimeout: (timeoutMs) => inbound.recvTimeout(timeoutMs),
        close: () => socket.close(),
      });
    });

    socket.addEventListener("error", (_) => {
      if (!opened) {
        reject("Failed to open WebSocket");
      }
    });
  });
}
