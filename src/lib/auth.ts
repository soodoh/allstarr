import { createServerOnlyFn } from "@tanstack/react-start";

export const getAuth = createServerOnlyFn(
	async () => (await import("./auth-server")).auth,
);
