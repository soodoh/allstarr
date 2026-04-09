import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import { ScrollArea } from "./scroll-area";

describe("ScrollArea", () => {
	it("renders the root and viewport around scrollable content", () => {
		const { container, getByText } = renderWithProviders(
			<ScrollArea className="custom-scroll">
				<div>Scrollable content</div>
			</ScrollArea>,
		);

		expect(getByText("Scrollable content")).toBeInTheDocument();
		expect(container.querySelector('[data-slot="scroll-area"]')).toHaveClass(
			"custom-scroll",
		);
		expect(
			container.querySelector('[data-slot="scroll-area-viewport"]'),
		).not.toBeNull();
	});
});
