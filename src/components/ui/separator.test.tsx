import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import Separator from "./separator";

describe("Separator", () => {
	it("renders the default horizontal separator", async () => {
		const { container } = await renderWithProviders(<Separator />);
		const separator = container.querySelector('[data-slot="separator"]');

		expect(separator).toHaveAttribute("data-orientation", "horizontal");
	});

	it("renders a vertical non-decorative separator", async () => {
		const { container } = await renderWithProviders(
			<Separator decorative={false} orientation="vertical" />,
		);
		const separator = container.querySelector('[data-slot="separator"]');

		expect(separator).toHaveAttribute("data-orientation", "vertical");
		expect(separator).toHaveAttribute("aria-orientation", "vertical");
	});
});
