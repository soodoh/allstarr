import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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
	it("renders the 404 state and home navigation action", () => {
		const { getByRole, getByText } = renderWithProviders(<NotFound />);

		expect(getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
		expect(getByText("Page not found")).toBeInTheDocument();
		expect(getByRole("link", { name: "Go Home" })).toHaveAttribute("href", "/");
	});
});
