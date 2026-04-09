import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import QueueConnectionBanner from "./queue-connection-banner";

describe("QueueConnectionBanner", () => {
	it("returns nothing when there are no warnings", () => {
		const { container } = renderWithProviders(
			<QueueConnectionBanner warnings={[]} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders warnings and dismisses them individually", async () => {
		const user = userEvent.setup();
		const { getAllByRole, getByText, queryByText } = renderWithProviders(
			<QueueConnectionBanner
				warnings={["Indexer offline", "Download client unreachable"]}
			/>,
		);

		expect(getByText("Indexer offline")).toBeInTheDocument();
		expect(getByText("Download client unreachable")).toBeInTheDocument();

		await user.click(getAllByRole("button", { name: "Dismiss warning" })[0]);

		expect(queryByText("Indexer offline")).not.toBeInTheDocument();
		expect(getByText("Download client unreachable")).toBeInTheDocument();

		await user.click(getAllByRole("button", { name: "Dismiss warning" })[0]);

		expect(queryByText("Download client unreachable")).not.toBeInTheDocument();
	});
});
