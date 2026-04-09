import type { PropsWithChildren } from "react";
import { render } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
		render(<Header />);

		// Wait for buttons to be present in the DOM
		await expect.element(page.getByRole("button").first()).toBeInTheDocument();
		const buttons = await page.getByRole("button").all();

		await buttons[0].click();

		expect(headerMocks.toggleSidebar).toHaveBeenCalledTimes(1);
	});

	it("signs out, shows a toast, and navigates to the login page", async () => {
		headerMocks.signOut.mockResolvedValueOnce(undefined);

		render(<Header />);

		await page.getByRole("button", { name: "Sign Out" }).click();

		await expect.poll(() => headerMocks.signOut).toHaveBeenCalledTimes(1);
		expect(headerMocks.toastSuccess).toHaveBeenCalledWith("Signed out");
		expect(headerMocks.navigate).toHaveBeenCalledWith({ to: "/login" });
	});
});
