import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import IndexerImplementationSelect from "./indexer-implementation-select";

describe("IndexerImplementationSelect", () => {
	it("selects the Newznab usenet implementation", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();

		const { getByRole } = renderWithProviders(
			<IndexerImplementationSelect onCancel={vi.fn()} onSelect={onSelect} />,
		);

		await user.click(getByRole("button", { name: /Newznab/i }));

		expect(onSelect).toHaveBeenCalledWith({
			implementation: "Newznab",
			protocol: "usenet",
		});
	});

	it("selects the Torznab torrent implementation", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();

		const { getByRole } = renderWithProviders(
			<IndexerImplementationSelect onCancel={vi.fn()} onSelect={onSelect} />,
		);

		await user.click(getByRole("button", { name: /Torznab/i }));

		expect(onSelect).toHaveBeenCalledWith({
			implementation: "Torznab",
			protocol: "torrent",
		});
	});

	it("cancels from the footer action", async () => {
		const user = userEvent.setup();
		const onCancel = vi.fn();

		const { getByRole } = renderWithProviders(
			<IndexerImplementationSelect onCancel={onCancel} onSelect={vi.fn()} />,
		);

		await user.click(getByRole("button", { name: "Cancel" }));

		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
