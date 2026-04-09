import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./card";

describe("Card", () => {
	it("renders the card slots and merges custom classes", () => {
		const { container, getByText } = renderWithProviders(
			<Card className="custom-card">
				<CardHeader className="custom-header">
					<div data-slot="card-action">Action</div>
					<CardTitle className="custom-title">Title</CardTitle>
					<CardDescription className="custom-description">
						Description
					</CardDescription>
				</CardHeader>
				<CardContent className="custom-content">Content</CardContent>
				<CardFooter className="custom-footer">Footer</CardFooter>
			</Card>,
		);

		expect(container.querySelector('[data-slot="card"]')).toHaveClass(
			"bg-card",
			"flex",
			"custom-card",
		);
		expect(container.querySelector('[data-slot="card-header"]')).toHaveClass(
			"@container/card-header",
			"has-data-[slot=card-action]:grid-cols-[1fr_auto]",
			"custom-header",
		);
		expect(container.querySelector('[data-slot="card-title"]')).toHaveClass(
			"leading-none",
			"font-semibold",
			"custom-title",
		);
		expect(
			container.querySelector('[data-slot="card-description"]'),
		).toHaveClass("text-muted-foreground", "text-sm", "custom-description");
		expect(container.querySelector('[data-slot="card-content"]')).toHaveClass(
			"px-6",
			"custom-content",
		);
		expect(container.querySelector('[data-slot="card-footer"]')).toHaveClass(
			"flex",
			"items-center",
			"custom-footer",
		);
		expect(getByText("Action")).toHaveAttribute("data-slot", "card-action");
		expect(getByText("Title")).toBeInTheDocument();
		expect(getByText("Description")).toBeInTheDocument();
		expect(getByText("Content")).toBeInTheDocument();
		expect(getByText("Footer")).toBeInTheDocument();
	});
});
