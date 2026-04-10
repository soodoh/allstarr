import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
	it("renders nothing when there are no items", async () => {
		const { container } = await renderWithProviders(
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
		const onPageChange = vi.fn();

		renderWithProviders(
			<TablePagination
				onPageChange={onPageChange}
				onPageSizeChange={vi.fn()}
				page={2}
				pageSize={25}
				totalItems={60}
				totalPages={3}
			/>,
		);

		await expect
			.element(page.getByText("Showing 26–50 of 60"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Previous page" }))
			.toBeEnabled();
		await expect
			.element(page.getByRole("button", { name: "Next page" }))
			.toBeEnabled();
		await expect
			.element(page.getByRole("button", { name: "Page 2" }))
			.toHaveAttribute("aria-current", "page");

		await page.getByRole("button", { name: "Previous page" }).click();
		await page.getByRole("button", { name: "Page 3" }).click();
		await page.getByRole("button", { name: "Next page" }).click();

		expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
		expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
		expect(onPageChange).toHaveBeenNthCalledWith(3, 3);
	});

	it("disables edge navigation and changes page size", async () => {
		const onPageSizeChange = vi.fn();

		renderWithProviders(
			<TablePagination
				onPageChange={vi.fn()}
				onPageSizeChange={onPageSizeChange}
				page={1}
				pageSize={10}
				totalItems={12}
				totalPages={2}
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Previous page" }))
			.toBeDisabled();

		await page.getByLabelText("Rows per page").selectOptions("50");

		expect(onPageSizeChange).toHaveBeenCalledWith(50);
	});

	it("renders gap markers for larger page counts", async () => {
		renderWithProviders(
			<TablePagination
				onPageChange={vi.fn()}
				onPageSizeChange={vi.fn()}
				page={5}
				pageSize={25}
				totalItems={500}
				totalPages={10}
			/>,
		);

		await expect.element(page.getByText("…").first()).toBeInTheDocument();
		expect(await page.getByText("…").all()).toHaveLength(2);
		await expect
			.element(page.getByRole("button", { name: "Page 1", exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Page 4", exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Page 5", exact: true }))
			.toHaveAttribute("aria-current", "page");
		await expect
			.element(page.getByRole("button", { name: "Page 6", exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Page 10", exact: true }))
			.toBeInTheDocument();
	});
});
