import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

type LoaderData = {
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
			registrationDisabled: false,
		};

		registerRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce(
			registrationStatus,
		);

		await expect(route.loader()).resolves.toEqual(registrationStatus);
		expect(registerRouteMocks.getRegistrationStatusFn).toHaveBeenCalledTimes(1);
	});

	it("renders the disabled registration state", () => {
		renderRegisterRoute({ registrationDisabled: true });

		expect(screen.getByText("Registration Disabled")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Back to Sign In" }),
		).toHaveAttribute("href", "/login");
	});

	it("creates an account, shows a success toast, and navigates home", async () => {
		const user = userEvent.setup();

		registerRouteMocks.signUpEmail.mockResolvedValueOnce({ error: null });

		renderRegisterRoute({ registrationDisabled: false });

		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "secret123");
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		await waitFor(() => {
			expect(registerRouteMocks.signUpEmail).toHaveBeenCalledWith({
				email: "ada@example.com",
				name: "Ada Lovelace",
				password: "secret123",
			});
			expect(registerRouteMocks.toastSuccess).toHaveBeenCalledWith(
				"Account created! Signing in...",
			);
			expect(registerRouteMocks.navigate).toHaveBeenCalledWith({ to: "/" });
		});
	});

	it("shows the sign-up error returned by the auth client", async () => {
		const user = userEvent.setup();

		registerRouteMocks.signUpEmail.mockResolvedValueOnce({
			error: { message: "Email already in use" },
		});

		renderRegisterRoute({ registrationDisabled: false });

		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "secret123");
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		await waitFor(() => {
			expect(registerRouteMocks.toastError).toHaveBeenCalledWith(
				"Email already in use",
			);
		});
		expect(registerRouteMocks.navigate).not.toHaveBeenCalled();
	});

	it("shows a fallback toast when sign-up throws", async () => {
		const user = userEvent.setup();

		registerRouteMocks.signUpEmail.mockRejectedValueOnce(new Error("boom"));

		renderRegisterRoute({ registrationDisabled: false });

		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "secret123");
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		await waitFor(() => {
			expect(registerRouteMocks.toastError).toHaveBeenCalledWith(
				"Failed to register",
			);
		});
	});
});
