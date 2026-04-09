import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "./context-menu";

describe("ContextMenu", () => {
	it("renders slots and portal content", async () => {
		await renderWithProviders(
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button type="button">Open menu</button>
				</ContextMenuTrigger>
				<ContextMenuContent className="custom-content">
					<ContextMenuItem>Default item</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>,
		);

		await expect
			.element(page.getByRole("button", { name: "Open menu" }))
			.toHaveAttribute("data-slot", "context-menu-trigger");

		await page
			.getByRole("button", { name: "Open menu" })
			.click({ button: "right" });
		await expect.element(page.getByText("Default item")).toBeInTheDocument();

		expect(
			document.body.querySelector('[data-slot="context-menu-content"]'),
		).toHaveClass("custom-content");
		expect(
			document.body.querySelector('[data-slot="context-menu-item"]'),
		).toHaveTextContent("Default item");
	});

	it("marks inset and destructive items", async () => {
		await renderWithProviders(
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button type="button">Open menu</button>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem inset>Inset item</ContextMenuItem>
					<ContextMenuItem variant="destructive">Delete item</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>,
		);

		await page
			.getByRole("button", { name: "Open menu" })
			.click({ button: "right" });
		await expect
			.element(page.getByRole("menuitem").first())
			.toBeInTheDocument();

		const items = document.body.querySelectorAll(
			'[data-slot="context-menu-item"]',
		);

		expect(items).toHaveLength(2);
		expect(items[0]).toHaveAttribute("data-inset", "true");
		expect(items[0]).toHaveAttribute("data-variant", "default");
		expect(items[1]).toHaveAttribute("data-variant", "destructive");
		expect(items[1]).not.toHaveAttribute("data-inset");
	});
});
