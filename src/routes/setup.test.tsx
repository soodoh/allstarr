import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
		const user = userEvent.setup();
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;

		setupRouteMocks.signUpEmail.mockResolvedValueOnce({ error: null });

		renderWithProviders(<Component />);

		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "admin@example.com");
		await user.type(screen.getByLabelText("Password"), "secret123");
		await user.click(
			screen.getByRole("button", { name: "Create Admin Account" }),
		);

		await waitFor(() => {
			expect(setupRouteMocks.signUpEmail).toHaveBeenCalledWith({
				email: "admin@example.com",
				name: "Ada Lovelace",
				password: "secret123",
			});
			expect(setupRouteMocks.toastSuccess).toHaveBeenCalledWith(
				"Admin account created!",
			);
			expect(setupRouteMocks.navigate).toHaveBeenCalledWith({ to: "/" });
		});
	});

	it("shows the auth client error when setup account creation fails", async () => {
		const user = userEvent.setup();
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;

		setupRouteMocks.signUpEmail.mockResolvedValueOnce({
			error: { message: "Setup failed" },
		});

		renderWithProviders(<Component />);

		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "admin@example.com");
		await user.type(screen.getByLabelText("Password"), "secret123");
		await user.click(
			screen.getByRole("button", { name: "Create Admin Account" }),
		);

		await waitFor(() => {
			expect(setupRouteMocks.toastError).toHaveBeenCalledWith("Setup failed");
		});
		expect(setupRouteMocks.navigate).not.toHaveBeenCalled();
	});

	it("shows a fallback toast when setup throws", async () => {
		const user = userEvent.setup();
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;

		setupRouteMocks.signUpEmail.mockRejectedValueOnce(new Error("boom"));

		renderWithProviders(<Component />);

		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "admin@example.com");
		await user.type(screen.getByLabelText("Password"), "secret123");
		await user.click(
			screen.getByRole("button", { name: "Create Admin Account" }),
		);

		await waitFor(() => {
			expect(setupRouteMocks.toastError).toHaveBeenCalledWith(
				"Failed to create account",
			);
		});
	});
});
