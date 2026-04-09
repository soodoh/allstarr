import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./accordion";

describe("Accordion", () => {
	it("renders slots and the content wrapper", async () => {
		const { container } = await renderWithProviders(
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
		await expect.element(page.getByText("First body")).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="accordion-content"] > div'),
		).toHaveClass("custom-content");
	});

	it("toggles the open state on the trigger and content", async () => {
		await renderWithProviders(
			<Accordion type="single" defaultValue="one" collapsible>
				<AccordionItem value="one">
					<AccordionTrigger>First</AccordionTrigger>
					<AccordionContent>
						<div>First body</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>,
		);

		const trigger = page.getByRole("button", { name: "First" });

		await expect.element(trigger).toHaveAttribute("data-state", "open");
		await expect.element(page.getByText("First body")).toBeInTheDocument();

		await trigger.click();

		await expect.element(trigger).toHaveAttribute("data-state", "closed");
		await expect.element(page.getByText("First body")).not.toBeInTheDocument();
	});
});
