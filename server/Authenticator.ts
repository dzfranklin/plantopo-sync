import { UserInfo } from "../core/index.ts";

export interface Authenticator {
  authenticate(token: string): Promise<UserInfo | null>;
}

export const TestAlwaysBobAuthenticator: Authenticator = {
  authenticate(_token) {
    return Promise.resolve({
      id: "bob",
      name: "Bob",
      isAnonymous: false,
    });
  },
};
