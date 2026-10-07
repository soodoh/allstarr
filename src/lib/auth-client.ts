import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient({
	plugins: [adminClient()],
});

export const { signIn, signUp, signOut } = authClient;
