import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { Badge } from "./badge";

describe("Badge", () => {
	it.each([
		["default", "bg-primary", "text-primary-foreground"],
		["secondary", "bg-secondary", "text-secondary-foreground"],
		["destructive", "bg-destructive", "text-white"],
		["outline", "border-border", "text-foreground"],
		["ghost", "[a&]:hover:bg-accent", "[a&]:hover:text-accent-foreground"],
		["link", "underline-offset-4", "text-primary"],
	] as const)("renders the %s variant styling", async (variant, className, token) => {
		await renderWithProviders(<Badge variant={variant}>Badge</Badge>);

		const badge = page.getByText("Badge");

		await expect.element(badge).toHaveAttribute("data-slot", "badge");
		await expect.element(badge).toHaveAttribute("data-variant", variant);
		await expect.element(badge).toHaveClass(className, token);
	});

	it("renders as a slotted child when asChild is enabled", async () => {
		await renderWithProviders(
			<Badge asChild variant="outline">
				<a href="/books">Books</a>
			</Badge>,
		);

		const link = page.getByRole("link", { name: "Books" });

		await expect.element(link).toHaveAttribute("data-slot", "badge");
		await expect.element(link).toHaveAttribute("data-variant", "outline");
		await expect
			.element(link)
			.toHaveClass("inline-flex", "rounded-full", "border-border");
	});
});
