import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "./context-menu";

describe("ContextMenu", () => {
	it("renders slots and portal content", async () => {
		const user = userEvent.setup();

		const { findByText, getByRole } = renderWithProviders(
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button type="button">Open menu</button>
				</ContextMenuTrigger>
				<ContextMenuContent className="custom-content">
					<ContextMenuItem>Default item</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>,
		);

		expect(getByRole("button", { name: "Open menu" })).toHaveAttribute(
			"data-slot",
			"context-menu-trigger",
		);

		await user.pointer([
			{
				target: getByRole("button", { name: "Open menu" }),
				keys: "[MouseRight]",
			},
		]);
		await findByText("Default item");

		expect(
			document.body.querySelector('[data-slot="context-menu-content"]'),
		).toHaveClass("custom-content");
		expect(
			document.body.querySelector('[data-slot="context-menu-item"]'),
		).toHaveTextContent("Default item");
	});

	it("marks inset and destructive items", async () => {
		const user = userEvent.setup();

		const { getByRole, findAllByRole } = renderWithProviders(
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

		await user.pointer([
			{
				target: getByRole("button", { name: "Open menu" }),
				keys: "[MouseRight]",
			},
		]);
		await findAllByRole("menuitem");

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
