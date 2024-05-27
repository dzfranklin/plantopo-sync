import { Msg as CoreMsg } from "./Msg.ts";

export type TransportConnecter = (
  doc: string
) => Promise<TransportConnectResult>;

export type TransportConnectResult =
  | { type: "ready"; transport: Transport }
  | { type: "error" };

export interface Transport<Msg = CoreMsg> {
  send(msg: Readonly<Msg>): void;
  close(): void;
  recv(): Promise<Readonly<Msg> | null>;
  recvTimeout(timeoutMs: number): Promise<Readonly<Msg> | null | undefined>;
}
