import { Transport, Msg, wsTransport } from "../core/index.ts";
import * as log from "./log.ts";

export async function upgradeWS(req: Request): Promise<{
  response: Response;
  socket: Transport<Msg>;
}> {
  const { socket, response } = Deno.upgradeWebSocket(req);
  return { response, socket: await wsTransport(socket, log.Logger) };
}
