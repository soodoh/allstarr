import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAuth: vi.fn(),
	getRequest: vi.fn(),
	getSession: vi.fn(),
	ensureSchedulerStarted: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
	}),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequest: mocks.getRequest,
}));

vi.mock("src/lib/auth", () => ({
	getAuth: mocks.getAuth,
}));

vi.mock("src/lib/runtime", () => ({
	isServerRuntime: false,
}));

vi.mock("./scheduler", () => ({
	ensureSchedulerStarted: mocks.ensureSchedulerStarted,
}));

import {
	getAuthSessionFn,
	getSessionFromRequest,
	requireAdmin,
	requireAuth,
} from "./middleware";

describe("middleware", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAuth.mockResolvedValue({
			api: { getSession: mocks.getSession },
		});
	});

	describe("getSessionFromRequest", () => {
		it("delegates to auth.api.getSession with request headers", async () => {
			const fakeHeaders = new Headers({ authorization: "Bearer tok" });
			const fakeRequest = new Request("http://localhost", {
				headers: fakeHeaders,
			});
			const fakeSession = { user: { id: "u1", role: "user" } };
			mocks.getSession.mockResolvedValue(fakeSession);

			const result = await getSessionFromRequest(fakeRequest);

			expect(mocks.getAuth).toHaveBeenCalledOnce();
			expect(mocks.getSession).toHaveBeenCalledWith({
				headers: fakeRequest.headers,
			});
			expect(result).toBe(fakeSession);
		});
	});

	describe("getAuthSessionFn", () => {
		it("gets the request then returns the session", async () => {
			const fakeRequest = new Request("http://localhost");
			const fakeSession = { user: { id: "u1", role: "user" } };
			mocks.getRequest.mockReturnValue(fakeRequest);
			mocks.getSession.mockResolvedValue(fakeSession);

			const result = await getAuthSessionFn();

			expect(mocks.getRequest).toHaveBeenCalledOnce();
			expect(result).toBe(fakeSession);
		});
	});

	describe("requireAuth", () => {
		it("throws 'Unauthorized' when session is null", async () => {
			const fakeRequest = new Request("http://localhost");
			mocks.getRequest.mockReturnValue(fakeRequest);
			mocks.getSession.mockResolvedValue(null);

			await expect(requireAuth()).rejects.toThrow("Unauthorized");
		});

		it("returns the session when valid", async () => {
			const fakeSession = { user: { id: "u1", role: "user" } };
			const fakeRequest = new Request("http://localhost");
			mocks.getRequest.mockReturnValue(fakeRequest);
			mocks.getSession.mockResolvedValue(fakeSession);

			const result = await requireAuth();

			expect(result).toBe(fakeSession);
		});

		it("does not call ensureSchedulerStarted when not server runtime", async () => {
			const fakeSession = { user: { id: "u1", role: "user" } };
			const fakeRequest = new Request("http://localhost");
			mocks.getRequest.mockReturnValue(fakeRequest);
			mocks.getSession.mockResolvedValue(fakeSession);

			await requireAuth();

			expect(mocks.ensureSchedulerStarted).not.toHaveBeenCalled();
		});
	});

	describe("requireAdmin", () => {
		it("throws 'Forbidden: admin access required' when role is not admin", async () => {
			const fakeSession = { user: { id: "u1", role: "user" } };
			const fakeRequest = new Request("http://localhost");
			mocks.getRequest.mockReturnValue(fakeRequest);
			mocks.getSession.mockResolvedValue(fakeSession);

			await expect(requireAdmin()).rejects.toThrow(
				"Forbidden: admin access required",
			);
		});

		it("returns the session when user is admin", async () => {
			const fakeSession = { user: { id: "u1", role: "admin" } };
			const fakeRequest = new Request("http://localhost");
			mocks.getRequest.mockReturnValue(fakeRequest);
			mocks.getSession.mockResolvedValue(fakeSession);

			const result = await requireAdmin();

			expect(result).toBe(fakeSession);
		});
	});
});
