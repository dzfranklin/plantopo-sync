import { z } from "zod/mod.ts";

export const UserInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAnonymous: z.boolean(),
});

export type UserInfo = z.infer<typeof UserInfoSchema>;
