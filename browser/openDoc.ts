import {
  TransportConnecter,
  InMemoryClientDocPersistence,
  wsTransport,
  Transport,
  ConsoleLogger,
} from "../core/index";
import { Doc, Logger } from "./index";

export function openDoc(config: OpenDocConfig, docId: string): Doc {
  const clientId =
    "c:" + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);

  // TODO: Use indexeddb
  const persistence = new InMemoryClientDocPersistence();

  return new Doc({
    clientId,
    docId,
    logger: config.logger,
    transport: wsConnecter(config),
    persistence,
  });
}

export interface OpenDocConfig {
  endpoint: string;
  token: string;
  logger?: Logger;
}

function wsConnecter(config: OpenDocConfig): TransportConnecter {
  const logger = config.logger || new ConsoleLogger();
  return async (docId) => {
    const l = logger.child({ docId });
    const inner = new WebSocket(config.endpoint + "/doc?docId=" + docId);

    let transport: Transport;
    try {
      transport = await wsTransport(inner, l);
    } catch (e) {
      l.warn("failed to connect", { error: e });
      return { type: "error" };
    }

    // Authenticate
    l.info("authenticating");
    transport.send({
      type: "auth",
      token: config.token,
    });
    const resp = await transport.recv();
    if (!resp) {
      l.warn("closed before auth response");
      return { type: "error" };
    }
    if (resp.type !== "authResult") {
      l.warn("expected authResult", { msg: resp });
      return { type: "error" };
    }
    if (!resp.success) {
      l.warn("auth failed", { issue: resp.issue });
      return { type: "error" };
    }

    l.info("authenticated", { user: resp.user.id });

    return { type: "ready", transport };
  };
}
