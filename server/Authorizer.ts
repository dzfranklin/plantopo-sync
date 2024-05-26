export type AuthorizationType = "read" | "write" | "none";

export interface Authorizer {
  check(docId: string, userId: string): Promise<AuthorizationType>;

  checkAdmin(token: string): boolean;
}

export const TestAllowAllAuthorizer: Authorizer = {
  check(_docId: string, _userId: string): Promise<AuthorizationType> {
    return Promise.resolve("write");
  },

  checkAdmin(_token: string): boolean {
    return true;
  },
};
