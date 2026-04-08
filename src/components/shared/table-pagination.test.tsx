import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value?: string;
	}) => (
		<select
			aria-label="Rows per page"
			onChange={(event) => onValueChange?.(event.target.value)}
			value={value}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => children,
	SelectValue: () => null,
}));

import TablePagination from "./table-pagination";

describe("TablePagination", () => {
	it("renders nothing when there are no items", () => {
		const { container } = renderWithProviders(
			<TablePagination
				onPageChange={vi.fn()}
				onPageSizeChange={vi.fn()}
				page={1}
				pageSize={25}
				totalItems={0}
				totalPages={1}
			/>,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders the current range and basic page controls", async () => {
		const user = userEvent.setup();
		const onPageChange = vi.fn();

		const { getByRole, getByText } = renderWithProviders(
			<TablePagination
				onPageChange={onPageChange}
				onPageSizeChange={vi.fn()}
				page={2}
				pageSize={25}
				totalItems={60}
				totalPages={3}
			/>,
		);

		expect(getByText("Showing 26–50 of 60")).toBeInTheDocument();
		expect(getByRole("button", { name: "Previous page" })).toBeEnabled();
		expect(getByRole("button", { name: "Next page" })).toBeEnabled();
		expect(getByRole("button", { name: "Page 2" })).toHaveAttribute(
			"aria-current",
			"page",
		);

		await user.click(getByRole("button", { name: "Previous page" }));
		await user.click(getByRole("button", { name: "Page 3" }));
		await user.click(getByRole("button", { name: "Next page" }));

		expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
		expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
		expect(onPageChange).toHaveBeenNthCalledWith(3, 3);
	});

	it("disables edge navigation and changes page size", async () => {
		const user = userEvent.setup();
		const onPageSizeChange = vi.fn();

		const { getByLabelText, getByRole } = renderWithProviders(
			<TablePagination
				onPageChange={vi.fn()}
				onPageSizeChange={onPageSizeChange}
				page={1}
				pageSize={10}
				totalItems={12}
				totalPages={2}
			/>,
		);

		expect(getByRole("button", { name: "Previous page" })).toBeDisabled();

		await user.selectOptions(getByLabelText("Rows per page"), "50");

		expect(onPageSizeChange).toHaveBeenCalledWith(50);
	});

	it("renders gap markers for larger page counts", () => {
		const { getAllByText, getByRole } = renderWithProviders(
			<TablePagination
				onPageChange={vi.fn()}
				onPageSizeChange={vi.fn()}
				page={5}
				pageSize={25}
				totalItems={500}
				totalPages={10}
			/>,
		);

		expect(getAllByText("…")).toHaveLength(2);
		expect(getByRole("button", { name: "Page 1" })).toBeInTheDocument();
		expect(getByRole("button", { name: "Page 4" })).toBeInTheDocument();
		expect(getByRole("button", { name: "Page 5" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(getByRole("button", { name: "Page 6" })).toBeInTheDocument();
		expect(getByRole("button", { name: "Page 10" })).toBeInTheDocument();
	});
});
