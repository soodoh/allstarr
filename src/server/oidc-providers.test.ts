import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAdmin: vi.fn(),
	selectAll: vi.fn(),
	selectGet: vi.fn(),
	insertGet: vi.fn(),
	updateRun: vi.fn(),
	deleteRun: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.selectAll,
				where: vi.fn(() => ({
					get: mocks.selectGet,
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(() => ({
					get: mocks.insertGet,
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: mocks.updateRun,
				})),
			})),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				run: mocks.deleteRun,
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	oidcProviders: {
		id: "oidcProviders.id",
		providerId: "oidcProviders.providerId",
	},
}));

vi.mock("src/lib/validators", () => ({
	createOidcProviderSchema: { parse: (d: unknown) => d },
	deleteOidcProviderSchema: { parse: (d: unknown) => d },
	updateOidcProviderSchema: { parse: (d: unknown) => d },
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
}));

import {
	createOidcProviderFn,
	deleteOidcProviderFn,
	listOidcProvidersFn,
	updateOidcProviderFn,
} from "./oidc-providers";

describe("OIDC provider server functions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAdmin.mockResolvedValue({
			user: { id: "admin-1", role: "admin" },
		});
	});

	describe("listOidcProvidersFn", () => {
		it("returns all providers after admin auth", async () => {
			const providers = [
				{ id: 1, providerId: "google", name: "Google" },
				{ id: 2, providerId: "github", name: "GitHub" },
			];
			mocks.selectAll.mockReturnValue(providers);

			const result = await listOidcProvidersFn();

			expect(mocks.requireAdmin).toHaveBeenCalledOnce();
			expect(result).toEqual(providers);
		});
	});

	describe("createOidcProviderFn", () => {
		it("creates provider when no duplicate exists", async () => {
			mocks.selectGet.mockReturnValue(undefined);
			const newProvider = {
				id: 1,
				providerId: "google",
				name: "Google",
				clientId: "client-id",
				clientSecret: "client-secret",
				issuerUrl: "https://accounts.google.com",
			};
			mocks.insertGet.mockReturnValue(newProvider);

			const result = await createOidcProviderFn({
				data: {
					providerId: "google",
					name: "Google",
					clientId: "client-id",
					clientSecret: "client-secret",
					issuerUrl: "https://accounts.google.com",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledOnce();
			expect(result).toEqual(newProvider);
		});

		it("throws when duplicate providerId found", async () => {
			mocks.selectGet.mockReturnValue({
				id: 1,
				providerId: "google",
				name: "Google",
			});

			await expect(
				createOidcProviderFn({
					data: {
						providerId: "google",
						name: "Google Duplicate",
						clientId: "client-id",
						clientSecret: "client-secret",
						issuerUrl: "https://accounts.google.com",
					},
				}),
			).rejects.toThrow('Provider with ID "google" already exists');
		});
	});

	describe("updateOidcProviderFn", () => {
		it("updates and returns success", async () => {
			mocks.updateRun.mockReturnValue(undefined);

			const result = await updateOidcProviderFn({
				data: {
					id: 1,
					name: "Updated Google",
					clientId: "new-client-id",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledOnce();
			expect(mocks.updateRun).toHaveBeenCalledOnce();
			expect(result).toEqual({ success: true });
		});
	});

	describe("deleteOidcProviderFn", () => {
		it("deletes and returns success", async () => {
			mocks.deleteRun.mockReturnValue(undefined);

			const result = await deleteOidcProviderFn({
				data: { id: 1 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledOnce();
			expect(mocks.deleteRun).toHaveBeenCalledOnce();
			expect(result).toEqual({ success: true });
		});
	});
});
