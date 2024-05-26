import { Authenticator } from "../../Authenticator.ts";
import { Authorizer } from "../../Authorizer.ts";
import { DocManager } from "../../DocManager.ts";
import { Handler } from "../mux.ts";
import handleDocGet from "./handleDocGet.ts";
import handleDocWS from "./handleDocWS.ts";

export interface DocHandlerConfig {
  authenticator: Authenticator;
  authorizer: Authorizer;
  docManager: DocManager;
}

export default function muxDoc(config: DocHandlerConfig): Handler {
  const wsHandler = handleDocWS(config);
  const getHandler = handleDocGet(config);
  return (req: Request, info: Deno.ServeHandlerInfo, url: URL) => {
    if (req.headers.get("upgrade") === "websocket") {
      return wsHandler(req, info, url);
    } else {
      return getHandler(req, info, url);
    }
  };
}
