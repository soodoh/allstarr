import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import IndexerImplementationSelect from "./indexer-implementation-select";

describe("IndexerImplementationSelect", () => {
	it("selects the Newznab usenet implementation", async () => {
		const onSelect = vi.fn();

		await renderWithProviders(
			<IndexerImplementationSelect onCancel={vi.fn()} onSelect={onSelect} />,
		);

		await page.getByRole("button", { name: /Newznab/i }).click();

		expect(onSelect).toHaveBeenCalledWith({
			implementation: "Newznab",
			protocol: "usenet",
		});
	});

	it("selects the Torznab torrent implementation", async () => {
		const onSelect = vi.fn();

		await renderWithProviders(
			<IndexerImplementationSelect onCancel={vi.fn()} onSelect={onSelect} />,
		);

		await page.getByRole("button", { name: /Torznab/i }).click();

		expect(onSelect).toHaveBeenCalledWith({
			implementation: "Torznab",
			protocol: "torrent",
		});
	});

	it("cancels from the footer action", async () => {
		const onCancel = vi.fn();

		await renderWithProviders(
			<IndexerImplementationSelect onCancel={onCancel} onSelect={vi.fn()} />,
		);

		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
