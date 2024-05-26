import { DocHandlerConfig } from "./doc/muxDoc.ts";
import { bearerToken, errorResponse } from "./helpers.ts";
import { Handler } from "./mux.ts";
import * as zod from "zod/mod.ts";

const CreateRequestSchema = zod.object({
  docId: zod.string(),
});

export default function handleCreate({
  authorizer,
  docManager,
}: DocHandlerConfig): Handler {
  return async (req, _info, _url) => {
    if (req.method !== "POST") {
      return errorResponse(405, "method not allowed");
    }

    const token = bearerToken(req);
    if (!token) {
      return errorResponse(
        400,
        "expected Authorization: Bearer <token> header"
      );
    }

    if (!authorizer.checkAdmin(token)) {
      return errorResponse(403, "unauthorized");
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return errorResponse(400, "invalid request body: " + e.message);
    }
    const request = CreateRequestSchema.safeParse(body);
    if (!request.success) {
      return errorResponse(
        400,
        "invalid request body: " + request.error.message
      );
    }

    docManager.create(request.data.docId);

    return new Response(JSON.stringify({}), {
      headers: {
        "content-type": "application/json",
      },
    });
  };
}
