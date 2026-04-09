import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import Slider from "./slider";

describe("Slider", () => {
	it("renders the public slots and falls back to min and max when no values are provided", () => {
		const { container } = renderWithProviders(
			<Slider aria-label="Range" min={10} max={90} />,
		);

		expect(container.querySelector('[data-slot="slider"]')).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="slider-track"]'),
		).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="slider-range"]'),
		).toBeInTheDocument();
		expect(
			container.querySelectorAll('[data-slot="slider-thumb"]'),
		).toHaveLength(2);
	});

	it("uses defaultValue to determine the thumb count", () => {
		const { container } = renderWithProviders(
			<Slider
				aria-label="Range"
				defaultValue={[10, 50, 90]}
				min={0}
				max={100}
			/>,
		);

		expect(
			container.querySelectorAll('[data-slot="slider-thumb"]'),
		).toHaveLength(3);
	});

	it("marks disabled thumbs and respects controlled value length", () => {
		const { container } = renderWithProviders(
			<Slider
				aria-label="Range"
				disabledThumbs={new Set([0])}
				onValueChange={vi.fn()}
				value={[42]}
			/>,
		);

		const thumb = container.querySelector('[data-slot="slider-thumb"]');

		expect(
			container.querySelectorAll('[data-slot="slider-thumb"]'),
		).toHaveLength(1);
		expect(thumb).toHaveAttribute("aria-disabled", "true");
		expect(thumb).toHaveAttribute("tabindex", "-1");
		expect(thumb).toHaveClass(
			"pointer-events-none",
			"opacity-30",
			"cursor-default",
		);
	});
});
