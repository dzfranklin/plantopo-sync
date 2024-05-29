import { Changeset } from "./Changeset.ts";
import { UserInfo } from "./UserInfo.ts";

export type Msg =
  | AuthMsg
  | AuthResultMsg
  | UpdateMsg
  | ServerUpdateMsg
  | ErrorMsg;

export interface UpdateMsg {
  type: "update";
  awareness: Readonly<Record<string, unknown>>;
  /** Required if changeset is provided */
  seq?: number;
  changeset?: Readonly<Changeset>;
}

export interface ServerUpdateMsg {
  type: "serverUpdate";
  seq: number;
  replyTo?: number;
  clients: Readonly<ClientInfo[]>;
  changeset?: Readonly<Changeset>;
}

export interface AuthMsg {
  type: "auth";
  token: string;
}

export interface AuthResultMsg {
  type: "authResult";
  success: boolean;
  issue?: "invalidToken" | "permissionDenied";

  /** Only present if success */
  authz?: "read" | "write";
  user?: UserInfo;
}

export interface ClientInfo {
  id: string;
  awareness: Readonly<Record<string, unknown>>;
  user: Readonly<UserInfo>;
}

export interface ErrorMsg {
  type: "error";
  error: "no-write-permission";
}
