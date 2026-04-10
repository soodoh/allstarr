import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import SearchToolbar from "./search-toolbar";

describe("SearchToolbar", () => {
	it("trims the query before searching and ignores blank submissions", async () => {
		const onSearch = vi.fn();
		await renderWithProviders(
			<SearchToolbar
				defaultQuery="  Terry Pratchett  "
				onSearch={onSearch}
				searching={false}
			/>,
		);

		await page.getByRole("button", { name: "Search" }).click();
		expect(onSearch).toHaveBeenCalledWith("Terry Pratchett");

		await page.getByRole("textbox").clear();
		await page.getByRole("textbox").fill("   ");
		// Button is disabled when query is blank — verify onSearch was not called again
		await expect
			.element(page.getByRole("button", { name: "Search" }))
			.toBeDisabled();
		expect(onSearch).toHaveBeenCalledTimes(1);
	});

	it("disables submit while searching or when the control is disabled", async () => {
		const { rerender } = await renderWithProviders(
			<SearchToolbar defaultQuery="Dune" onSearch={vi.fn()} searching />,
		);

		await expect
			.element(page.getByRole("button", { name: "Searching..." }))
			.toBeDisabled();

		await rerender(
			<SearchToolbar
				defaultQuery="Dune"
				disabled
				onSearch={vi.fn()}
				searching={false}
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Search" }))
			.toBeDisabled();
	});
});
