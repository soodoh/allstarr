import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import PageHeader from "./page-header";

describe("PageHeader", () => {
	it("renders the title without optional content", () => {
		const { container, getByRole, queryByText } = renderWithProviders(
			<PageHeader title="Library" />,
		);

		expect(
			getByRole("heading", { level: 1, name: "Library" }),
		).toBeInTheDocument();
		expect(queryByText("Manage your books")).not.toBeInTheDocument();
		expect(container.querySelector(".shrink-0")).toBeNull();
	});

	it("renders the optional description and actions", () => {
		const { getByRole, getByText } = renderWithProviders(
			<PageHeader
				actions={<button type="button">Add item</button>}
				description="Manage your books"
				title="Library"
			/>,
		);

		expect(getByText("Manage your books")).toBeInTheDocument();
		expect(getByRole("button", { name: "Add item" })).toBeInTheDocument();
	});
});
