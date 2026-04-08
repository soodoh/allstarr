import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import ActionButtonGroup from "./action-button-group";

describe("ActionButtonGroup", () => {
	it("invokes the refresh, edit, and delete callbacks", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn();
		const onEdit = vi.fn();
		const onRefreshMetadata = vi.fn();

		const { getByRole } = renderWithProviders(
			<ActionButtonGroup
				isRefreshing={false}
				onDelete={onDelete}
				onEdit={onEdit}
				onRefreshMetadata={onRefreshMetadata}
			/>,
		);

		await user.click(getByRole("button", { name: "Update metadata" }));
		await user.click(getByRole("button", { name: "Edit" }));
		await user.click(getByRole("button", { name: "Delete" }));

		expect(onRefreshMetadata).toHaveBeenCalledTimes(1);
		expect(onEdit).toHaveBeenCalledTimes(1);
		expect(onDelete).toHaveBeenCalledTimes(1);
	});

	it("disables refresh and swaps in the loading icon while refreshing", () => {
		const { container, getByRole } = renderWithProviders(
			<ActionButtonGroup
				isRefreshing
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				onRefreshMetadata={vi.fn()}
			/>,
		);

		expect(getByRole("button", { name: "Update metadata" })).toBeDisabled();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	it("renders the external link action only when a url is provided", () => {
		const { getByRole, rerender, queryByRole } = renderWithProviders(
			<ActionButtonGroup
				externalLabel="Open in external service"
				externalUrl={null}
				isRefreshing={false}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				onRefreshMetadata={vi.fn()}
			/>,
		);

		expect(
			queryByRole("link", { name: "Open in external service" }),
		).not.toBeInTheDocument();

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

		expect(
			getByRole("link", { name: "Open in external service" }),
		).toHaveAttribute("href", "https://example.com/item");
	});
});
