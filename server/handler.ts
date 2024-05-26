import { DocManager } from "./DocManager.ts";
import * as log from "./log.ts";
import { Authenticator } from "./Authenticator.ts";
import { Authorizer } from "./Authorizer.ts";
import { upgradeWS } from "./wsChannel.ts";

export function handler(
  authenticator: Authenticator,
  authorizer: Authorizer,
  sessionManager: DocManager
) {
  return async (req: Request, info: Deno.ServeHandlerInfo) => {
    const url = new URL(req.url);

    if (url.pathname !== "/v1/ws") {
      return new Response("not found", { status: 404 });
    }

    if (req.headers.get("upgrade") != "websocket") {
      return new Response("missing Upgrade: websocket", { status: 501 });
    }

    const docId = url.searchParams.get("docId");
    if (!docId) {
      return new Response("missing docId search parameter", { status: 400 });
    }

    const clientId =
      "sid:" + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);

    log.info("WebSocket connection", {
      docId,
      remoteHost: info.remoteAddr.hostname,
      clientId,
    });

    const { socket, response } = await upgradeWS(req);

    // Authenticate

    const authMsg = await socket.recv();
    if (!authMsg) return response;
    if (authMsg.type !== "auth") {
      log.info("unexpected message", authMsg);
      return response;
    }

    const user = await authenticator.authenticate(authMsg.token);
    if (!user) {
      socket.send({
        type: "authResult",
        success: false,
        issue: "invalidToken",
      });
      return response;
    }

    // Authorize

    const authz = await authorizer.check(docId, user.id);
    if (authz === "none") {
      socket.send({
        type: "authResult",
        success: false,
        issue: "permissionDenied",
      });
      return response;
    }

    // Connect

    socket.send({
      type: "authResult",
      success: true,
      user,
    });

    const doc = await sessionManager.get(docId);
    doc.connect(
      {
        clientId,
        authz,
        user,
      },
      socket
    );

    return response;
  };
}
