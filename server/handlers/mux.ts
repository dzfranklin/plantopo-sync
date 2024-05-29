import * as log from "../log.ts";
import muxDoc, { DocHandlerConfig } from "./doc/muxDoc.ts";
import handleCreate from "./handleCreate.ts";
import handleMetrics from "./handleMetrics.ts";
import * as prom from "prom-client/";

const requestCounter = new prom.Counter({
  name: "requests_total",
  help: "Total number of requests",
});

export type Handler = (
  req: Request,
  info: Deno.ServeHandlerInfo,
  url: URL
) => Promise<Response>;

export interface HandlerConfig {
  doc: DocHandlerConfig;
}

export default function mux(
  config: HandlerConfig
): (req: Request, info: Deno.ServeHandlerInfo) => Promise<Response> {
  const docHandler = muxDoc(config.doc);
  const createHandler = handleCreate(config.doc);
  return (req: Request, info: Deno.ServeHandlerInfo) => {
    const url = new URL(req.url);

    requestCounter.inc();
    if (url.pathname.startsWith("/v1/")) {
      log.info("request v1", {
        requestMethod: req.method,
        requestPath: url.pathname,
        requestSearch: url.search,
        remoteAddr: info.remoteAddr.hostname,
      });
    }

    switch (url.pathname) {
      case "/v1/doc":
        return docHandler(req, info, url);
      case "/v1/create":
        return createHandler(req, info, url);
      case "/health":
        return Promise.resolve(new Response("OK", { status: 200 }));
      case "/metrics":
        return handleMetrics(req, info, url);
      default:
        return Promise.resolve(new Response("Not found", { status: 404 }));
    }
  };
}
