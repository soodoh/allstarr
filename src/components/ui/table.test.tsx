import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./table";

describe("Table", () => {
	it("renders the wrapper and core table slots", async () => {
		const { container } = await renderWithProviders(
			<Table className="custom-table">
				<TableHeader className="custom-header">
					<TableRow className="custom-header-row">
						<TableHead className="custom-head">Title</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody className="custom-body">
					<TableRow className="custom-row" data-state="selected">
						<TableCell className="custom-cell">Row</TableCell>
					</TableRow>
				</TableBody>
			</Table>,
		);

		expect(
			container.querySelector('[data-slot="table-container"]'),
		).toHaveClass("relative", "overflow-x-auto");
		expect(container.querySelector('[data-slot="table"]')).toHaveClass(
			"w-full",
			"caption-bottom",
			"custom-table",
		);
		expect(container.querySelector('[data-slot="table-header"]')).toHaveClass(
			"[&_tr]:border-b",
			"custom-header",
		);
		expect(container.querySelector('[data-slot="table-body"]')).toHaveClass(
			"[&_tr:last-child]:border-0",
			"custom-body",
		);
		expect(container.querySelector('[data-slot="table-row"]')).toHaveClass(
			"border-b",
			"data-[state=selected]:bg-muted",
			"custom-header-row",
		);
		expect(
			container.querySelectorAll('[data-slot="table-row"]')[1],
		).toHaveAttribute("data-state", "selected");
		expect(container.querySelector('[data-slot="table-head"]')).toHaveClass(
			"text-foreground",
			"font-medium",
			"custom-head",
		);
		expect(container.querySelector('[data-slot="table-cell"]')).toHaveClass(
			"p-2",
			"align-middle",
			"custom-cell",
		);
		await expect.element(page.getByText("Title")).toBeInTheDocument();
		await expect.element(page.getByText("Row")).toBeInTheDocument();
	});
});
