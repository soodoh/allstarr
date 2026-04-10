import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

type LoaderData = {
	oidcProviders: Array<{
		displayName: string;
		providerId: string;
	}>;
	registrationDisabled: boolean;
};

const loginRouteMocks = vi.hoisted(() => ({
	getRegistrationStatusFn: vi.fn(),
	hasUsersFn: vi.fn(),
	navigate: vi.fn(),
	signInEmail: vi.fn(),
	signInOauth2: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		to,
	}: {
		children: ReactNode;
		className?: string;
		to: string;
	}) => (
		<a className={className} href={to}>
			{children}
		</a>
	),
	createFileRoute: () => (config: unknown) => config,
	redirect: (options: { to: string }) => options,
	useNavigate: () => loginRouteMocks.navigate,
}));

vi.mock("sonner", () => ({
	toast: {
		error: (message: string) => loginRouteMocks.toastError(message),
	},
}));

vi.mock("src/lib/auth-client", () => ({
	signIn: {
		email: (...args: unknown[]) => loginRouteMocks.signInEmail(...args),
		oauth2: (...args: unknown[]) => loginRouteMocks.signInOauth2(...args),
	},
}));

vi.mock("src/server/setup", () => ({
	getRegistrationStatusFn: () => loginRouteMocks.getRegistrationStatusFn(),
	hasUsersFn: () => loginRouteMocks.hasUsersFn(),
}));

import { Route } from "./login";

function renderLoginRoute(loaderData: LoaderData) {
	const route = Route as unknown as {
		component: () => JSX.Element;
		useLoaderData: () => LoaderData;
	};
	const Component = route.component;

	route.useLoaderData = () => loaderData;
	return renderWithProviders(<Component />);
}

describe("login route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to setup when no users exist", async () => {
		const route = Route as unknown as {
			beforeLoad: () => Promise<unknown>;
		};

		loginRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: false });

		await expect(route.beforeLoad()).rejects.toMatchObject({ to: "/setup" });
		expect(loginRouteMocks.getRegistrationStatusFn).not.toHaveBeenCalled();
	});

	it("returns the registration status from the loader", async () => {
		const route = Route as unknown as {
			loader: () => Promise<LoaderData>;
		};
		const registrationStatus: LoaderData = {
			oidcProviders: [],
			registrationDisabled: false,
		};

		loginRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce(
			registrationStatus,
		);

		await expect(route.loader()).resolves.toEqual(registrationStatus);
		expect(loginRouteMocks.getRegistrationStatusFn).toHaveBeenCalledTimes(1);
	});

	it("signs in with email and navigates home on success", async () => {
		loginRouteMocks.signInEmail.mockResolvedValueOnce({ error: null });

		await renderLoginRoute({
			oidcProviders: [],
			registrationDisabled: false,
		});

		await page.getByLabelText("Email").fill("user@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Sign In" }).click();

		await expect
			.poll(() => loginRouteMocks.signInEmail)
			.toHaveBeenCalledWith({
				email: "user@example.com",
				password: "secret123",
			});
		await expect
			.poll(() => loginRouteMocks.navigate)
			.toHaveBeenCalledWith({
				to: "/",
			});
	});

	it("shows the sign-in error returned by the auth client", async () => {
		loginRouteMocks.signInEmail.mockResolvedValueOnce({
			error: { message: "Bad credentials" },
		});

		await renderLoginRoute({
			oidcProviders: [],
			registrationDisabled: false,
		});

		await page.getByLabelText("Email").fill("user@example.com");
		await page.getByLabelText("Password").fill("wrong");
		await page.getByRole("button", { name: "Sign In" }).click();

		await expect
			.poll(() => loginRouteMocks.toastError)
			.toHaveBeenCalledWith("Bad credentials");
		expect(loginRouteMocks.navigate).not.toHaveBeenCalled();
	});

	it("shows a fallback toast when sign-in throws", async () => {
		loginRouteMocks.signInEmail.mockRejectedValueOnce(new Error("boom"));

		await renderLoginRoute({
			oidcProviders: [],
			registrationDisabled: false,
		});

		await page.getByLabelText("Email").fill("user@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Sign In" }).click();

		await expect
			.poll(() => loginRouteMocks.toastError)
			.toHaveBeenCalledWith("Failed to sign in");
	});

	it("starts OIDC sign-in when a provider button is clicked", async () => {
		await renderLoginRoute({
			oidcProviders: [{ displayName: "GitHub", providerId: "github" }],
			registrationDisabled: false,
		});

		await page.getByRole("button", { name: "Sign in with GitHub" }).click();

		expect(loginRouteMocks.signInOauth2).toHaveBeenCalledWith({
			callbackURL: "/",
			providerId: "github",
		});
	});

	it("shows a toast when OIDC sign-in fails", async () => {
		loginRouteMocks.signInOauth2.mockRejectedValueOnce(new Error("boom"));

		await renderLoginRoute({
			oidcProviders: [{ displayName: "GitHub", providerId: "github" }],
			registrationDisabled: false,
		});

		await page.getByRole("button", { name: "Sign in with GitHub" }).click();

		await expect
			.poll(() => loginRouteMocks.toastError)
			.toHaveBeenCalledWith("Failed to sign in with provider");
	});
});
