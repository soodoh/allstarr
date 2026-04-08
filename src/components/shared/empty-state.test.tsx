import { Plus } from "lucide-react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import EmptyState from "./empty-state";

describe("EmptyState", () => {
	it("renders the icon, title, and description", () => {
		const { container, getByText } = renderWithProviders(
			<EmptyState
				description="Add your first item to get started."
				icon={Plus}
				title="No items"
			/>,
		);

		expect(getByText("No items")).toBeInTheDocument();
		expect(
			getByText("Add your first item to get started."),
		).toBeInTheDocument();
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("renders optional action content when provided", () => {
		const { getByRole } = renderWithProviders(
			<EmptyState
				action={<button type="button">Create item</button>}
				description="Add your first item to get started."
				icon={Plus}
				title="No items"
			/>,
		);

		expect(getByRole("button", { name: "Create item" })).toBeInTheDocument();
	});
});
