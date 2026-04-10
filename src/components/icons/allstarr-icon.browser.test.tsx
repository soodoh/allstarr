import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import AllstarrIcon from "./allstarr-icon";

describe("AllstarrIcon", () => {
	it("renders the SVG shell with the provided class name", async () => {
		const { container } = await renderWithProviders(
			<AllstarrIcon className="custom-icon" />,
		);
		const icon = container.querySelector("svg");

		expect(icon).toHaveAttribute("viewBox", "0 0 24 24");
		expect(icon).toHaveAttribute("fill", "currentColor");
		expect(icon).toHaveAttribute("aria-hidden", "true");
		expect(icon).toHaveClass("custom-icon");
		expect(container.querySelectorAll("path")).toHaveLength(2);
		expect(container.querySelectorAll("circle")).toHaveLength(4);
	});
});
