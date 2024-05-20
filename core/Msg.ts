import { Changeset } from "./Changeset.ts";
import { UserInfo } from "./UserInfo.ts";

export type Msg = UpdateMsg | ServerUpdateMsg;

export interface UpdateMsg {
  type: "update";
  awareness: Readonly<Record<string, unknown>>;
  /** Required if changeset is provided */
  seq?: number;
  changeset?: Readonly<Changeset>;
}

export interface ServerUpdateMsg {
  type: "serverUpdate";
  replyTo?: number;
  clients: Readonly<ClientInfo[]>;
  changeset?: Readonly<Changeset>;
}

export interface ClientInfo {
  id: string;
  awareness: Readonly<Record<string, unknown>>;
  user: Readonly<UserInfo>;
}
