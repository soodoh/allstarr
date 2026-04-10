import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import ContentTypeFilter from "./content-type-filter";

describe("ContentTypeFilter", () => {
	it("renders all content-type options and highlights the selected one", async () => {
		await renderWithProviders(
			<ContentTypeFilter onChange={vi.fn()} value="tv" />,
		);

		await expect
			.element(page.getByRole("button", { name: "All" }))
			.toHaveAttribute("data-variant", "outline");
		await expect
			.element(page.getByRole("button", { name: "Books" }))
			.toHaveAttribute("data-variant", "outline");
		await expect
			.element(page.getByRole("button", { name: "TV Shows" }))
			.toHaveAttribute("data-variant", "default");
		await expect
			.element(page.getByRole("button", { name: "Movies" }))
			.toHaveAttribute("data-variant", "outline");
	});

	it("calls onChange with the clicked content type", async () => {
		const onChange = vi.fn();
		await renderWithProviders(
			<ContentTypeFilter onChange={onChange} value="all" />,
		);

		await page.getByRole("button", { name: "Movies" }).click();

		expect(onChange).toHaveBeenCalledWith("movies");
	});
});
