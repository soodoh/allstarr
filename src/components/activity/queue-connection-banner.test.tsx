import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import QueueConnectionBanner from "./queue-connection-banner";

describe("QueueConnectionBanner", () => {
	it("returns nothing when there are no warnings", async () => {
		const { container } = await renderWithProviders(
			<QueueConnectionBanner warnings={[]} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders warnings and dismisses them individually", async () => {
		await renderWithProviders(
			<QueueConnectionBanner
				warnings={["Indexer offline", "Download client unreachable"]}
			/>,
		);

		await expect.element(page.getByText("Indexer offline")).toBeInTheDocument();
		await expect
			.element(page.getByText("Download client unreachable"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Dismiss warning" }).first().click();

		await expect
			.element(page.getByText("Indexer offline"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("Download client unreachable"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Dismiss warning" }).first().click();

		await expect
			.element(page.getByText("Download client unreachable"))
			.not.toBeInTheDocument();
	});
});
