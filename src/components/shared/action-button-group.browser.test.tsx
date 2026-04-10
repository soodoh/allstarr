import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import ActionButtonGroup from "./action-button-group";

describe("ActionButtonGroup", () => {
	it("invokes the refresh, edit, and delete callbacks", async () => {
		const onDelete = vi.fn();
		const onEdit = vi.fn();
		const onRefreshMetadata = vi.fn();

		renderWithProviders(
			<ActionButtonGroup
				isRefreshing={false}
				onDelete={onDelete}
				onEdit={onEdit}
				onRefreshMetadata={onRefreshMetadata}
			/>,
		);

		await page.getByRole("button", { name: "Update metadata" }).click();
		await page.getByRole("button", { name: "Edit" }).click();
		await page.getByRole("button", { name: "Delete" }).click();

		expect(onRefreshMetadata).toHaveBeenCalledTimes(1);
		expect(onEdit).toHaveBeenCalledTimes(1);
		expect(onDelete).toHaveBeenCalledTimes(1);
	});

	it("disables refresh and swaps in the loading icon while refreshing", async () => {
		const { container } = await renderWithProviders(
			<ActionButtonGroup
				isRefreshing
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				onRefreshMetadata={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Update metadata" }))
			.toBeDisabled();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	it("renders the external link action only when a url is provided", async () => {
		const { rerender } = await renderWithProviders(
			<ActionButtonGroup
				externalLabel="Open in external service"
				externalUrl={null}
				isRefreshing={false}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				onRefreshMetadata={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByRole("link", { name: "Open in external service" }))
			.not.toBeInTheDocument();

		rerender(
			<ActionButtonGroup
				externalLabel="Open in external service"
				externalUrl="https://example.com/item"
				isRefreshing={false}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				onRefreshMetadata={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByRole("link", { name: "Open in external service" }))
			.toHaveAttribute("href", "https://example.com/item");
	});
});
