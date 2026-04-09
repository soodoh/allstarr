import { Plus } from "lucide-react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import EmptyState from "./empty-state";

describe("EmptyState", () => {
	it("renders the icon, title, and description", async () => {
		const { container } = await renderWithProviders(
			<EmptyState
				description="Add your first item to get started."
				icon={Plus}
				title="No items"
			/>,
		);

		await expect.element(page.getByText("No items")).toBeInTheDocument();
		await expect
			.element(page.getByText("Add your first item to get started."))
			.toBeInTheDocument();
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("renders optional action content when provided", async () => {
		renderWithProviders(
			<EmptyState
				action={<button type="button">Create item</button>}
				description="Add your first item to get started."
				icon={Plus}
				title="No items"
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Create item" }))
			.toBeInTheDocument();
	});
});
