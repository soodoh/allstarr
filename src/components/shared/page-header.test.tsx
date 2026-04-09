import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import PageHeader from "./page-header";

describe("PageHeader", () => {
	it("renders the title without optional content", async () => {
		const { container } = await renderWithProviders(
			<PageHeader title="Library" />,
		);

		await expect
			.element(page.getByRole("heading", { level: 1, name: "Library" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Manage your books"))
			.not.toBeInTheDocument();
		expect(container.querySelector(".shrink-0")).toBeNull();
	});

	it("renders the optional description and actions", async () => {
		renderWithProviders(
			<PageHeader
				actions={<button type="button">Add item</button>}
				description="Manage your books"
				title="Library"
			/>,
		);

		await expect
			.element(page.getByText("Manage your books"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Add item" }))
			.toBeInTheDocument();
	});
});
