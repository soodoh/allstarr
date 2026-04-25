import type { JSX } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

type LoaderData = {
	emailPasswordRegistrationDisabled: boolean;
	oidcProviders: Array<{
		displayName: string;
		providerId: string;
	}>;
	registrationDisabled: boolean;
};

const setupRouteMocks = vi.hoisted(() => ({
	getRegistrationStatusFn: vi.fn(),
	hasUsersFn: vi.fn(),
	navigate: vi.fn(),
	signInOauth2: vi.fn(),
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
	signIn: {
		oauth2: (...args: unknown[]) => setupRouteMocks.signInOauth2(...args),
	},
	signUp: {
		email: (...args: unknown[]) => setupRouteMocks.signUpEmail(...args),
	},
}));

vi.mock("src/server/setup", () => ({
	getRegistrationStatusFn: () => setupRouteMocks.getRegistrationStatusFn(),
	hasUsersFn: () => setupRouteMocks.hasUsersFn(),
}));

import { Route } from "./setup";

function renderSetupRoute(loaderData: LoaderData) {
	const route = Route as unknown as {
		component: () => JSX.Element;
		useLoaderData: () => LoaderData;
	};
	const Component = route.component;

	route.useLoaderData = () => loaderData;
	return renderWithProviders(<Component />);
}

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

	it("returns the registration status from the loader", async () => {
		const route = Route as unknown as {
			loader: () => Promise<LoaderData>;
		};
		const registrationStatus: LoaderData = {
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [{ displayName: "Authentik", providerId: "authentik" }],
			registrationDisabled: false,
		};

		setupRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce(
			registrationStatus,
		);

		await expect(route.loader()).resolves.toEqual(registrationStatus);
		expect(setupRouteMocks.getRegistrationStatusFn).toHaveBeenCalledTimes(1);
	});

	it("creates the initial admin account and navigates home", async () => {
		setupRouteMocks.signUpEmail.mockResolvedValueOnce({ error: null });

		await renderSetupRoute({
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: false,
		});

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
		setupRouteMocks.signUpEmail.mockResolvedValueOnce({
			error: { message: "Setup failed" },
		});

		await renderSetupRoute({
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: false,
		});

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
		setupRouteMocks.signUpEmail.mockRejectedValueOnce(new Error("boom"));

		await renderSetupRoute({
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: false,
		});

		await page.getByLabelText("Name").fill("Ada Lovelace");
		await page.getByLabelText("Email").fill("admin@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Create Admin Account" }).click();

		await expect
			.poll(() => setupRouteMocks.toastError)
			.toHaveBeenCalledWith("Failed to create account");
	});

	it("starts OIDC setup when a first-admin provider button is clicked", async () => {
		await renderSetupRoute({
			emailPasswordRegistrationDisabled: true,
			oidcProviders: [{ displayName: "Authentik", providerId: "authentik" }],
			registrationDisabled: false,
		});

		await page.getByRole("button", { name: "Continue with Authentik" }).click();

		expect(setupRouteMocks.signInOauth2).toHaveBeenCalledWith({
			callbackURL: "/",
			providerId: "authentik",
		});
	});

	it("renders a configuration error when no account creation method is configured", async () => {
		await renderSetupRoute({
			emailPasswordRegistrationDisabled: true,
			oidcProviders: [],
			registrationDisabled: false,
		});

		await expect
			.element(page.getByText("No account creation method is configured."))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Create Admin Account" }))
			.not.toBeInTheDocument();
	});
});
