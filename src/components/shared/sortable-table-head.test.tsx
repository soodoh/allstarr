import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import SortableTableHead from "./sortable-table-head";

async function renderSortableHead(props?: {
	sortColumn?: string;
	sortDirection?: "asc" | "desc";
}) {
	const onSort = vi.fn();
	const view = await renderWithProviders(
		<table>
			<thead>
				<tr>
					<SortableTableHead
						column="title"
						onSort={onSort}
						sortColumn={props?.sortColumn}
						sortDirection={props?.sortDirection}
					>
						Title
					</SortableTableHead>
				</tr>
			</thead>
		</table>,
	);

	return { ...view, onSort };
}

describe("SortableTableHead", () => {
	it("renders the inactive sort affordance and calls onSort", async () => {
		const { container, onSort } = await renderSortableHead();

		await expect.element(page.getByText("Title")).toBeInTheDocument();
		expect(container.querySelector('[data-slot="table-head"]')).toHaveClass(
			"cursor-pointer",
			"select-none",
		);
		expect(container.querySelector("svg")).toHaveClass(
			"text-muted-foreground/60",
		);

		await page.getByText("Title").click();

		expect(onSort).toHaveBeenCalledWith("title");
	});

	it("renders the ascending icon styling for the active column", async () => {
		const { container } = await renderSortableHead({
			sortColumn: "title",
			sortDirection: "asc",
		});

		expect(container.querySelector("svg")).toHaveClass("text-foreground");
	});

	it("renders the descending icon styling for the active column", async () => {
		const { container } = await renderSortableHead({
			sortColumn: "title",
			sortDirection: "desc",
		});

		expect(container.querySelector("svg")).toHaveClass("text-foreground");
	});
});
