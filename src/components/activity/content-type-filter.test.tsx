import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import ContentTypeFilter from "./content-type-filter";

describe("ContentTypeFilter", () => {
	it("renders all content-type options and highlights the selected one", () => {
		const { getByRole } = renderWithProviders(
			<ContentTypeFilter onChange={vi.fn()} value="tv" />,
		);

		expect(getByRole("button", { name: "All" })).toHaveAttribute(
			"data-variant",
			"outline",
		);
		expect(getByRole("button", { name: "Books" })).toHaveAttribute(
			"data-variant",
			"outline",
		);
		expect(getByRole("button", { name: "TV Shows" })).toHaveAttribute(
			"data-variant",
			"default",
		);
		expect(getByRole("button", { name: "Movies" })).toHaveAttribute(
			"data-variant",
			"outline",
		);
	});

	it("calls onChange with the clicked content type", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		const { getByRole } = renderWithProviders(
			<ContentTypeFilter onChange={onChange} value="all" />,
		);

		await user.click(getByRole("button", { name: "Movies" }));

		expect(onChange).toHaveBeenCalledWith("movies");
	});
});
