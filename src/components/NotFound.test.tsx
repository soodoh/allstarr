import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: React.ComponentPropsWithoutRef<"a"> & { to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

import NotFound from "./NotFound";

describe("NotFound", () => {
	it("renders the 404 state and home navigation action", async () => {
		await renderWithProviders(<NotFound />);

		await expect
			.element(page.getByRole("heading", { level: 1, name: "404" }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Page not found")).toBeInTheDocument();
		await expect
			.element(page.getByRole("link", { name: "Go Home" }))
			.toHaveAttribute("href", "/");
	});
});
