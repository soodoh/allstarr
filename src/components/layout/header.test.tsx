import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const headerMocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	signOut: vi.fn(),
	toggleSidebar: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => headerMocks.navigate,
}));

vi.mock("src/components/ui/sidebar", () => ({
	useSidebar: () => ({
		toggleSidebar: headerMocks.toggleSidebar,
	}),
}));

vi.mock("src/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: PropsWithChildren) => <>{children}</>,
	DropdownMenuContent: ({ children }: PropsWithChildren) => (
		<div data-testid="dropdown-content">{children}</div>
	),
	DropdownMenuItem: ({
		children,
		onClick,
	}: PropsWithChildren<{ onClick?: () => void }>) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("src/lib/auth-client", () => ({
	signOut: () => headerMocks.signOut(),
}));

vi.mock("sonner", () => ({
	toast: {
		success: (message: string) => headerMocks.toastSuccess(message),
	},
}));

vi.mock("src/components/ui/avatar", () => ({
	Avatar: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AvatarFallback: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));

import Header from "./header";

describe("Header", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("toggles the sidebar from the menu button", async () => {
		const user = userEvent.setup();

		render(<Header />);

		const [toggleButton] = screen.getAllByRole("button");

		await user.click(toggleButton);

		expect(headerMocks.toggleSidebar).toHaveBeenCalledTimes(1);
	});

	it("signs out, shows a toast, and navigates to the login page", async () => {
		const user = userEvent.setup();
		headerMocks.signOut.mockResolvedValueOnce(undefined);

		render(<Header />);

		await user.click(screen.getByRole("button", { name: "Sign Out" }));

		await waitFor(() => {
			expect(headerMocks.signOut).toHaveBeenCalledTimes(1);
			expect(headerMocks.toastSuccess).toHaveBeenCalledWith("Signed out");
			expect(headerMocks.navigate).toHaveBeenCalledWith({ to: "/login" });
		});
	});
});
