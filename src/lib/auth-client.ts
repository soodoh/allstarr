import { adminClient, genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient({
	plugins: [adminClient(), genericOAuthClient()],
});

export const { signIn, signUp, signOut } = authClient;
