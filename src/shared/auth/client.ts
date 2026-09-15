import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

/**
 * Browser-side auth client. Only the login and change-password forms use it;
 * everything else reads the session on the server.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const { signIn, signOut, changePassword, useSession } = authClient;
