import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAuth } from "src/lib/auth";

export async function getSessionFromRequest(request: Request) {
	const auth = await getAuth();
	return auth.api.getSession({
		headers: request.headers,
	});
}

export const getAuthSessionFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const request = getRequest();
		return getSessionFromRequest(request);
	},
);

export async function requireAuth() {
	const session = await getAuthSessionFn();
	if (!session) {
		throw new Error("Unauthorized");
	}
	if (import.meta.env.SSR) {
		// Lazy import to break dependency cycle and keep scheduler code
		// out of the client bundle.
		const { ensureSchedulerStarted } = await import("./scheduler");
		ensureSchedulerStarted();
	}
	return session;
}

export async function requireAdmin() {
	const session = await requireAuth();
	if (session.user.role !== "admin") {
		throw new Error("Forbidden: admin access required");
	}
	return session;
}
