import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import SearchToolbar from "./search-toolbar";

describe("SearchToolbar", () => {
	it("trims the query before searching and ignores blank submissions", async () => {
		const user = userEvent.setup();
		const onSearch = vi.fn();
		const { getByRole } = renderWithProviders(
			<SearchToolbar
				defaultQuery="  Terry Pratchett  "
				onSearch={onSearch}
				searching={false}
			/>,
		);

		await user.click(getByRole("button", { name: "Search" }));
		expect(onSearch).toHaveBeenCalledWith("Terry Pratchett");

		await user.clear(getByRole("textbox"));
		await user.type(getByRole("textbox"), "   ");
		await user.click(getByRole("button", { name: "Search" }));
		expect(onSearch).toHaveBeenCalledTimes(1);
	});

	it("disables submit while searching or when the control is disabled", () => {
		const { getByRole, rerender } = renderWithProviders(
			<SearchToolbar defaultQuery="Dune" onSearch={vi.fn()} searching />,
		);

		expect(getByRole("button", { name: "Searching..." })).toBeDisabled();

		rerender(
			<SearchToolbar
				defaultQuery="Dune"
				disabled
				onSearch={vi.fn()}
				searching={false}
			/>,
		);

		expect(getByRole("button", { name: "Search" })).toBeDisabled();
	});
});
