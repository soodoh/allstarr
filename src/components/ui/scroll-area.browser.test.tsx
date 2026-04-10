import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { ScrollArea } from "./scroll-area";

describe("ScrollArea", () => {
	it("renders the root and viewport around scrollable content", async () => {
		const { container } = await renderWithProviders(
			<ScrollArea className="custom-scroll">
				<div>Scrollable content</div>
			</ScrollArea>,
		);

		await expect
			.element(page.getByText("Scrollable content"))
			.toBeInTheDocument();
		expect(container.querySelector('[data-slot="scroll-area"]')).toHaveClass(
			"custom-scroll",
		);
		expect(
			container.querySelector('[data-slot="scroll-area-viewport"]'),
		).not.toBeNull();
	});
});
