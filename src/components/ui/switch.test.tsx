import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import Switch from "./switch";

describe("Switch", () => {
	it("renders the default switch size and checked state", () => {
		const { container } = renderWithProviders(<Switch checked />);

		expect(container.querySelector('[data-slot="switch"]')).toHaveAttribute(
			"data-size",
			"default",
		);
		expect(
			container.querySelector('[data-slot="switch-thumb"]'),
		).not.toBeNull();
	});

	it("renders the small size variant and forwards disabled props", () => {
		const { container } = renderWithProviders(<Switch disabled size="sm" />);

		expect(container.querySelector('[data-slot="switch"]')).toHaveAttribute(
			"data-size",
			"sm",
		);
		expect(container.querySelector('[data-slot="switch"]')).toBeDisabled();
	});
});
