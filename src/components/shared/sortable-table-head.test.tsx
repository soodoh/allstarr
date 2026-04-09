import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import SortableTableHead from "./sortable-table-head";

function renderSortableHead(props?: {
	sortColumn?: string;
	sortDirection?: "asc" | "desc";
}) {
	const onSort = vi.fn();
	const view = renderWithProviders(
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
		const user = userEvent.setup();
		const { container, getByText, onSort } = renderSortableHead();

		expect(getByText("Title")).toBeInTheDocument();
		expect(container.querySelector('[data-slot="table-head"]')).toHaveClass(
			"cursor-pointer",
			"select-none",
		);
		expect(container.querySelector("svg")).toHaveClass(
			"text-muted-foreground/60",
		);

		await user.click(getByText("Title"));

		expect(onSort).toHaveBeenCalledWith("title");
	});

	it("renders the ascending icon styling for the active column", () => {
		const { container } = renderSortableHead({
			sortColumn: "title",
			sortDirection: "asc",
		});

		expect(container.querySelector("svg")).toHaveClass("text-foreground");
	});

	it("renders the descending icon styling for the active column", () => {
		const { container } = renderSortableHead({
			sortColumn: "title",
			sortDirection: "desc",
		});

		expect(container.querySelector("svg")).toHaveClass("text-foreground");
	});
});
