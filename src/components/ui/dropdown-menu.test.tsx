import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./dropdown-menu";

describe("DropdownMenu", () => {
	it("renders trigger and content in a portal", async () => {
		await renderWithProviders(
			<DropdownMenu open>
				<DropdownMenuTrigger asChild>
					<button type="button">Open menu</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="custom-content">
					<DropdownMenuItem>Item</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(
			document.body.querySelector('[data-slot="dropdown-menu-trigger"]'),
		).toHaveTextContent("Open menu");
		expect(
			document.body.querySelector('[data-slot="dropdown-menu-content"]'),
		).toHaveClass("custom-content");
		expect(
			document.body.querySelector('[data-slot="dropdown-menu-item"]'),
		).toHaveTextContent("Item");
	});

	it("marks items with inset and destructive variant metadata", async () => {
		await renderWithProviders(
			<DropdownMenu open>
				<DropdownMenuTrigger asChild>
					<button type="button">Open menu</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem inset>Inset item</DropdownMenuItem>
					<DropdownMenuItem variant="destructive">Delete item</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const items = document.body.querySelectorAll(
			'[data-slot="dropdown-menu-item"]',
		);
		expect(items[0]).toHaveAttribute("data-inset", "true");
		expect(items[0]).toHaveAttribute("data-variant", "default");
		expect(items[1]).toHaveAttribute("data-variant", "destructive");
		expect(items[1]).not.toHaveAttribute("data-inset");
	});
});
