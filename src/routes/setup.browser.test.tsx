import type { JSX } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const setupRouteMocks = vi.hoisted(() => ({
	hasUsersFn: vi.fn(),
	navigate: vi.fn(),
	signUpEmail: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
	redirect: (options: { to: string }) => options,
	useNavigate: () => setupRouteMocks.navigate,
}));

vi.mock("sonner", () => ({
	toast: {
		error: (message: string) => setupRouteMocks.toastError(message),
		success: (message: string) => setupRouteMocks.toastSuccess(message),
	},
}));

vi.mock("src/lib/auth-client", () => ({
	signUp: {
		email: (...args: unknown[]) => setupRouteMocks.signUpEmail(...args),
	},
}));

vi.mock("src/server/setup", () => ({
	hasUsersFn: () => setupRouteMocks.hasUsersFn(),
}));

import { Route } from "./setup";

describe("setup route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to login when users already exist", async () => {
		const route = Route as unknown as {
			beforeLoad: () => Promise<unknown>;
		};

		setupRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: true });

		await expect(route.beforeLoad()).rejects.toMatchObject({ to: "/login" });
	});

	it("creates the initial admin account and navigates home", async () => {
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;

		setupRouteMocks.signUpEmail.mockResolvedValueOnce({ error: null });

		await renderWithProviders(<Component />);

		await page.getByLabelText("Name").fill("Ada Lovelace");
		await page.getByLabelText("Email").fill("admin@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Create Admin Account" }).click();

		await expect
			.poll(() => setupRouteMocks.signUpEmail)
			.toHaveBeenCalledWith({
				email: "admin@example.com",
				name: "Ada Lovelace",
				password: "secret123",
			});
		await expect
			.poll(() => setupRouteMocks.toastSuccess)
			.toHaveBeenCalledWith("Admin account created!");
		await expect
			.poll(() => setupRouteMocks.navigate)
			.toHaveBeenCalledWith({ to: "/" });
	});

	it("shows the auth client error when setup account creation fails", async () => {
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;

		setupRouteMocks.signUpEmail.mockResolvedValueOnce({
			error: { message: "Setup failed" },
		});

		await renderWithProviders(<Component />);

		await page.getByLabelText("Name").fill("Ada Lovelace");
		await page.getByLabelText("Email").fill("admin@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Create Admin Account" }).click();

		await expect
			.poll(() => setupRouteMocks.toastError)
			.toHaveBeenCalledWith("Setup failed");
		expect(setupRouteMocks.navigate).not.toHaveBeenCalled();
	});

	it("shows a fallback toast when setup throws", async () => {
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;

		setupRouteMocks.signUpEmail.mockRejectedValueOnce(new Error("boom"));

		await renderWithProviders(<Component />);

		await page.getByLabelText("Name").fill("Ada Lovelace");
		await page.getByLabelText("Email").fill("admin@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Create Admin Account" }).click();

		await expect
			.poll(() => setupRouteMocks.toastError)
			.toHaveBeenCalledWith("Failed to create account");
	});
});
