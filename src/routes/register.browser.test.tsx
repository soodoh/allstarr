import type { JSX, ReactNode } from "react";
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

const registerRouteMocks = vi.hoisted(() => ({
	getRegistrationStatusFn: vi.fn(),
	hasUsersFn: vi.fn(),
	navigate: vi.fn(),
	signUpEmail: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
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
	useNavigate: () => registerRouteMocks.navigate,
}));

vi.mock("sonner", () => ({
	toast: {
		error: (message: string) => registerRouteMocks.toastError(message),
		success: (message: string) => registerRouteMocks.toastSuccess(message),
	},
}));

vi.mock("src/lib/auth-client", () => ({
	signUp: {
		email: (...args: unknown[]) => registerRouteMocks.signUpEmail(...args),
	},
}));

vi.mock("src/server/setup", () => ({
	getRegistrationStatusFn: () => registerRouteMocks.getRegistrationStatusFn(),
	hasUsersFn: () => registerRouteMocks.hasUsersFn(),
}));

import { Route } from "./register";

function renderRegisterRoute(loaderData: LoaderData) {
	const route = Route as unknown as {
		component: () => JSX.Element;
		useLoaderData: () => LoaderData;
	};
	const Component = route.component;

	route.useLoaderData = () => loaderData;
	return renderWithProviders(<Component />);
}

describe("register route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to setup when no users exist", async () => {
		const route = Route as unknown as {
			beforeLoad: () => Promise<unknown>;
		};

		registerRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: false });

		await expect(route.beforeLoad()).rejects.toMatchObject({ to: "/setup" });
		expect(registerRouteMocks.getRegistrationStatusFn).not.toHaveBeenCalled();
	});

	it("returns the registration status from the loader", async () => {
		const route = Route as unknown as {
			loader: () => Promise<LoaderData>;
		};
		const registrationStatus: LoaderData = {
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: false,
		};

		registerRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce(
			registrationStatus,
		);

		await expect(route.loader()).resolves.toEqual(registrationStatus);
		expect(registerRouteMocks.getRegistrationStatusFn).toHaveBeenCalledTimes(1);
	});

	it("renders the disabled registration state", async () => {
		await renderRegisterRoute({
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: true,
		});

		await expect
			.element(page.getByText("Registration Disabled"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Back to Sign In" }))
			.toHaveAttribute("href", "/login");
	});

	it("renders the disabled registration state when email/password registration is disabled", async () => {
		await renderRegisterRoute({
			emailPasswordRegistrationDisabled: true,
			oidcProviders: [],
			registrationDisabled: false,
		});

		await expect
			.element(page.getByText("Registration Disabled"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText(/Account registration is currently disabled/))
			.toBeInTheDocument();
	});

	it("creates an account, shows a success toast, and navigates home", async () => {
		registerRouteMocks.signUpEmail.mockResolvedValueOnce({ error: null });

		await renderRegisterRoute({
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: false,
		});

		await page.getByLabelText("Name").fill("Ada Lovelace");
		await page.getByLabelText("Email").fill("ada@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Create Account" }).click();

		await expect
			.poll(() => registerRouteMocks.signUpEmail)
			.toHaveBeenCalledWith({
				email: "ada@example.com",
				name: "Ada Lovelace",
				password: "secret123",
			});
		await expect
			.poll(() => registerRouteMocks.toastSuccess)
			.toHaveBeenCalledWith("Account created! Signing in...");
		await expect
			.poll(() => registerRouteMocks.navigate)
			.toHaveBeenCalledWith({ to: "/" });
	});

	it("shows the sign-up error returned by the auth client", async () => {
		registerRouteMocks.signUpEmail.mockResolvedValueOnce({
			error: { message: "Email already in use" },
		});

		await renderRegisterRoute({
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: false,
		});

		await page.getByLabelText("Name").fill("Ada Lovelace");
		await page.getByLabelText("Email").fill("ada@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Create Account" }).click();

		await expect
			.poll(() => registerRouteMocks.toastError)
			.toHaveBeenCalledWith("Email already in use");
		expect(registerRouteMocks.navigate).not.toHaveBeenCalled();
	});

	it("shows a fallback toast when sign-up throws", async () => {
		registerRouteMocks.signUpEmail.mockRejectedValueOnce(new Error("boom"));

		await renderRegisterRoute({
			emailPasswordRegistrationDisabled: false,
			oidcProviders: [],
			registrationDisabled: false,
		});

		await page.getByLabelText("Name").fill("Ada Lovelace");
		await page.getByLabelText("Email").fill("ada@example.com");
		await page.getByLabelText("Password").fill("secret123");
		await page.getByRole("button", { name: "Create Account" }).click();

		await expect
			.poll(() => registerRouteMocks.toastError)
			.toHaveBeenCalledWith("Failed to register");
	});
});
