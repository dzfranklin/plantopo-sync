import { UserInfoSchema } from "./UserInfo.ts";
import { z } from "zod/mod.ts";

export const ChangesetSchema = z.object({
  schema: z.literal(0),
  /** obj */
  create: z.array(z.string()).optional(),
  /** obj */
  delete: z.array(z.string()).optional(),
  /** [obj, key, value] */
  property: z.array(z.tuple([z.string(), z.string(), z.unknown()])).optional(),
  /** [child, parent, idx] */
  position: z.array(z.tuple([z.string(), z.string(), z.string()])).optional(),
});

export type Changeset = z.infer<typeof ChangesetSchema>;

const ClientInfoSchema = z
  .object({
    id: z.string(),
    awareness: z.record(z.unknown()).readonly(),
    user: UserInfoSchema.readonly(),
  })
  .readonly();

export type ClientInfo = z.infer<typeof ClientInfoSchema>;

const UpdateMsgSchema = z
  .object({
    type: z.literal("update"),
    awareness: z.record(z.unknown()).readonly(),
    /** Required if changeset is provided */
    seq: z.number().optional(),
    changeset: ChangesetSchema.optional().readonly(),
  })
  .readonly();

export type UpdateMsg = z.infer<typeof UpdateMsgSchema>;

const ServerUpdateMsgSchema = z
  .object({
    type: z.literal("serverUpdate"),
    seq: z.number(),
    replyTo: z.number().optional(),
    clients: z.array(ClientInfoSchema).readonly(),
    changeset: ChangesetSchema.optional().readonly(),
  })
  .readonly();

export type ServerUpdateMsg = z.infer<typeof ServerUpdateMsgSchema>;

export const AuthMsgSchema = z
  .object({
    type: z.literal("auth"),
    token: z.string(),
  })
  .readonly();

export type AuthMsg = z.infer<typeof AuthMsgSchema>;

export const AuthResultMsgSchema = z
  .object({
    type: z.literal("authResult"),
    success: z.boolean(),
    issue: z.enum(["invalid-token", "permission-denied"]).optional(),

    /** Only present if success */
    authz: z.enum(["read", "write"]).optional(),
    user: UserInfoSchema.optional().readonly(),
  })
  .readonly();

export type AuthResultMsg = z.infer<typeof AuthResultMsgSchema>;

const ErrorMsgSchema = z
  .object({
    type: z.literal("error"),
    error: z.enum(["no-write-permission", "doc-not-found"]),
  })
  .readonly();

export type ErrorMsg = z.infer<typeof ErrorMsgSchema>;

export const MsgSchema = z.union([
  AuthMsgSchema,
  AuthResultMsgSchema,
  UpdateMsgSchema,
  ServerUpdateMsgSchema,
  ErrorMsgSchema,
]);

export type Msg = z.infer<typeof MsgSchema>;
