import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "./popover";

describe("Popover helpers", () => {
	it("renders trigger, content, header, and title helpers", () => {
		const { getByRole, getByText } = renderWithProviders(
			<Popover open>
				<PopoverTrigger asChild>
					<button type="button">Open</button>
				</PopoverTrigger>
				<PopoverContent className="custom-content">
					<PopoverHeader className="custom-header">
						<PopoverTitle className="custom-title">Details</PopoverTitle>
					</PopoverHeader>
				</PopoverContent>
			</Popover>,
		);

		expect(getByRole("button", { name: "Open" })).toHaveAttribute(
			"data-slot",
			"popover-trigger",
		);
		expect(getByText("Details")).toHaveAttribute("data-slot", "popover-title");
		expect(
			document.body.querySelector('[data-slot="popover-content"]'),
		).toHaveClass("custom-content");
		expect(
			document.body.querySelector('[data-slot="popover-header"]'),
		).toHaveClass("custom-header");
	});

	it("applies custom alignment and side offset to content", () => {
		renderWithProviders(
			<Popover open>
				<PopoverTrigger asChild>
					<button type="button">Open</button>
				</PopoverTrigger>
				<PopoverContent align="end" sideOffset={8}>
					Body
				</PopoverContent>
			</Popover>,
		);

		expect(
			document.body.querySelector('[data-slot="popover-content"]'),
		).toHaveAttribute("data-align", "end");
	});
});
