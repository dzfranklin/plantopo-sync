import { Handler } from "../mux.ts";
import { DocHandlerConfig } from "./muxDoc.ts";
import { monotonicFactory as monotonicFactoryULIDFactory } from "ulid/mod.ts";
import * as log from "../../log.ts";
import * as prom from "prom-client/";
import { wsTransport } from "../../../core/wsTransport.ts";
import { errorResponse } from "../helpers.ts";

const clientIdFactory = monotonicFactoryULIDFactory();

const activeRequestsGauge = new prom.Gauge({
  name: "doc_ws_active_requests",
  help: "Number of active WebSocket requests for docs",
});
const requestDurationHistogram = new prom.Histogram({
  name: "doc_ws_request_duration_minutes",
  help: "Duration of WebSocket requests for docs",
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 240, 480, 1440, 10080],
});
const acceptedRequestsCounter = new prom.Counter({
  name: "doc_ws_accepted_requests_total",
  help: "Total number of WebSocket requests accepted",
});
const authnRejectionsCounter = new prom.Counter({
  name: "doc_ws_authn_rejections_total",
  help: "Total number of WebSocket requests rejected at the authentication stage",
});
const authzRejectionsCounter = new prom.Counter({
  name: "doc_ws_authz_rejections_total",
  help: "Total number of WebSocket requests rejected at the authorization stage",
});

export default function handleDocWS({
  authenticator,
  authorizer,
  docManager,
}: DocHandlerConfig): Handler {
  return async (req: Request, info: Deno.ServeHandlerInfo, url: URL) => {
    const docId = url.searchParams.get("docId");
    if (!docId) return errorResponse(400, "missing docId search parameter");

    const clientId = "sid:" + clientIdFactory();

    const { socket, response } = Deno.upgradeWebSocket(req);

    log.info("WebSocket connection", {
      docId,
      remoteHost: info.remoteAddr.hostname,
      clientId,
    });
    activeRequestsGauge.inc();
    const start = Date.now();
    socket.addEventListener("close", () => {
      requestDurationHistogram.observe((Date.now() - start) / 1000 / 60);
      activeRequestsGauge.dec();
    });

    const transport = await wsTransport(socket, log.Logger);

    // Authenticate

    const authMsg = await transport.recv();
    if (!authMsg) return response;
    if (authMsg.type !== "auth") {
      log.info("unexpected message", authMsg);
      return response;
    }

    const user = await authenticator.authenticate(authMsg.token);
    if (!user) {
      transport.send({
        type: "authResult",
        success: false,
        issue: "invalidToken",
      });
      authnRejectionsCounter.inc();
      return response;
    }

    // Authorize

    const authz = await authorizer.check(docId, user.id);
    if (authz === "none") {
      transport.send({
        type: "authResult",
        success: false,
        issue: "permissionDenied",
      });
      authzRejectionsCounter.inc();
      return response;
    }

    // Connect

    const doc = await docManager.get(docId);
    if (!doc) {
      log.info("doc not found", { docId });
      // just have the client retry, this should fail authz next time
      return response;
    }

    acceptedRequestsCounter.inc();

    transport.send({
      type: "authResult",
      success: true,
      user,
    });

    doc.connect(
      {
        clientId,
        authz,
        user,
      },
      transport
    );

    return response;
  };
}
