import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
	it.each([
		["default", "bg-primary", "text-primary-foreground"],
		["secondary", "bg-secondary", "text-secondary-foreground"],
		["destructive", "bg-destructive", "text-white"],
		["outline", "border-border", "text-foreground"],
		["ghost", "[a&]:hover:bg-accent", "[a&]:hover:text-accent-foreground"],
		["link", "underline-offset-4", "text-primary"],
	] as const)("renders the %s variant styling", (variant, className, token) => {
		const { getByText } = renderWithProviders(
			<Badge variant={variant}>Badge</Badge>,
		);

		const badge = getByText("Badge");

		expect(badge).toHaveAttribute("data-slot", "badge");
		expect(badge).toHaveAttribute("data-variant", variant);
		expect(badge).toHaveClass(className, token);
	});

	it("renders as a slotted child when asChild is enabled", () => {
		const { getByRole } = renderWithProviders(
			<Badge asChild variant="outline">
				<a href="/books">Books</a>
			</Badge>,
		);

		const link = getByRole("link", { name: "Books" });

		expect(link).toHaveAttribute("data-slot", "badge");
		expect(link).toHaveAttribute("data-variant", "outline");
		expect(link).toHaveClass("inline-flex", "rounded-full", "border-border");
	});
});
