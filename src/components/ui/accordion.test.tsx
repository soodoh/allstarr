import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./accordion";

describe("Accordion", () => {
	it("renders slots and the content wrapper", () => {
		const { container, getByText } = renderWithProviders(
			<Accordion type="single" defaultValue="one" collapsible>
				<AccordionItem className="custom-item" value="one">
					<AccordionTrigger className="custom-trigger">First</AccordionTrigger>
					<AccordionContent className="custom-content">
						<div>First body</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>,
		);

		expect(
			container.querySelector('[data-slot="accordion"]'),
		).toBeInTheDocument();
		expect(container.querySelector('[data-slot="accordion-item"]')).toHaveClass(
			"custom-item",
		);
		expect(
			container.querySelector('[data-slot="accordion-trigger"]'),
		).toHaveClass("custom-trigger");
		expect(getByText("First body")).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="accordion-content"] > div'),
		).toHaveClass("custom-content");
	});

	it("toggles the open state on the trigger and content", async () => {
		const user = userEvent.setup();

		const { getByRole, queryByText } = renderWithProviders(
			<Accordion type="single" defaultValue="one" collapsible>
				<AccordionItem value="one">
					<AccordionTrigger>First</AccordionTrigger>
					<AccordionContent>
						<div>First body</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>,
		);

		const trigger = getByRole("button", { name: "First" });

		expect(trigger).toHaveAttribute("data-state", "open");
		expect(queryByText("First body")).toBeInTheDocument();

		await user.click(trigger);

		expect(trigger).toHaveAttribute("data-state", "closed");
		expect(queryByText("First body")).not.toBeInTheDocument();
	});
});
