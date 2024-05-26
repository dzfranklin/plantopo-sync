export type AuthorizationType = "read" | "write" | "none";

export interface Authorizer {
  check(docId: string, userId: string): Promise<AuthorizationType>;
}

export const TestAllowAllAuthorizer: Authorizer = {
  async check(docId: string, userId: string): Promise<AuthorizationType> {
    return "write";
  },
};
