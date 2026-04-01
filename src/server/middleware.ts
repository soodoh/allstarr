import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "src/lib/auth";

export const getAuthSessionFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const request = getRequest();
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return session;
	},
);

export async function requireAuth() {
	const session = await getAuthSessionFn();
	if (!session) {
		throw new Error("Unauthorized");
	}
	// Lazy import to break dependency cycle:
	// middleware → scheduler → ... → indexers → middleware
	const { ensureSchedulerStarted } = await import("./scheduler");
	ensureSchedulerStarted();
	return session;
}
