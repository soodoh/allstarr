import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { Avatar, AvatarFallback } from "./avatar";

describe("Avatar", () => {
	it.each([
		["default", "size-8"],
		["sm", "data-[size=sm]:size-6"],
		["lg", "data-[size=lg]:size-10"],
	] as const)("renders the %s size branch", async (size, className) => {
		const { container } = await renderWithProviders(<Avatar size={size} />);

		expect(container.querySelector('[data-slot="avatar"]')).toHaveAttribute(
			"data-size",
			size,
		);
		expect(container.querySelector('[data-slot="avatar"]')).toHaveClass(
			"group/avatar",
			"rounded-full",
			className,
		);
	});

	it("renders the fallback slot and size-aware text class", async () => {
		const { container } = await renderWithProviders(
			<Avatar size="sm">
				<AvatarFallback className="custom-fallback">PD</AvatarFallback>
			</Avatar>,
		);

		expect(
			container.querySelector('[data-slot="avatar-fallback"]'),
		).toHaveClass(
			"bg-muted",
			"text-muted-foreground",
			"group-data-[size=sm]/avatar:text-xs",
			"custom-fallback",
		);
		await expect
			.element(page.getByText("PD"))
			.toHaveAttribute("data-slot", "avatar-fallback");
	});
});
