import { bearerToken, errorResponse } from "../helpers.ts";
import { Handler } from "../mux.ts";
import { DocHandlerConfig } from "./muxDoc.ts";
import * as prom from "prom-client/";

const requestCounter = new prom.Counter({
  name: "doc_get_requests_total",
  help: "Total number of get requests for docs",
});

export default function handleDocGet({
  authenticator,
  authorizer,
  docManager,
}: DocHandlerConfig): Handler {
  return async (req, _info, url) => {
    requestCounter.inc();

    const docId = url.searchParams.get("docId");
    if (!docId) return errorResponse(400, "missing docId search parameter");

    const token = bearerToken(req);
    if (!token) {
      return errorResponse(
        400,
        "expected Authorization: Bearer <token> header"
      );
    }

    const user = await authenticator.authenticate(token);
    if (!user) return errorResponse(401, "invalid token");

    const authz = authorizer.check(docId, user.id);
    if (!authz) return errorResponse(403, "unauthorized");

    const doc = await docManager.get(docId);
    if (!doc) return errorResponse(404, "doc not found");

    const value = doc.collect();

    return new Response(
      JSON.stringify({
        doc: value,
      }),
      {
        headers: {
          "content-type": "application/json",
        },
      }
    );
  };
}
