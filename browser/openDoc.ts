import {
  TransportConnecter,
  InMemoryClientDocPersistence,
  wsTransport,
  Transport,
  ConsoleLogger,
  ClientDocPersistence,
} from "../core/index.ts";
import { Doc, Logger } from "./index.ts";

export function openDoc(config: OpenDocConfig, docId: string): Doc {
  // TODO: Use indexeddb
  const persistence = config.persistence ?? new InMemoryClientDocPersistence();

  return new Doc({
    docId,
    logger: config.logger,
    transport: wsConnecter(config),
    persistence,
  });
}

export interface OpenDocConfig {
  endpoint: string;
  acquireToken: () => Promise<string>;
  logger?: Logger;
  extraParams?: Record<string, string>;
  persistence?: ClientDocPersistence;
}

function wsConnecter(config: OpenDocConfig): TransportConnecter {
  const logger = config.logger || new ConsoleLogger();
  return async (docId) => {
    const l = logger.child({ docId });

    const token = await config.acquireToken();

    const params = new URLSearchParams();
    params.set("docId", docId);
    if (config.extraParams) {
      for (const [key, value] of Object.entries(config.extraParams)) {
        params.set(key, value);
      }
    }
    const url = config.endpoint + "/doc?" + params.toString();

    l.info("connecting to", { url });
    const inner = new WebSocket(url);

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
      token,
    });

    const resp = await transport.recvTimeout(10000);
    if (resp === null) {
      l.warn("closed before auth response");
      return { type: "error" };
    } else if (resp === undefined) {
      l.warn("timeout waiting for auth response");
      transport.close();
      return { type: "error" };
    } else if (resp.type === "error") {
      l.warn("auth error", { error: resp.error });
      return { type: "error" };
    } else if (resp.type !== "authResult") {
      l.warn("expected authResult", { msg: resp });
      return { type: "error" };
    } else if (!resp.success) {
      l.warn("auth failed", { issue: resp.issue });
      return { type: "error" };
    }

    l.info("authenticated", { user: resp.user?.id, authz: resp.authz });

    return { type: "ready", transport };
  };
}
