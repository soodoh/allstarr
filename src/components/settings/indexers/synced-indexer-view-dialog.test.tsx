import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const syncedIndexerDialogMocks = vi.hoisted(() => ({
	categoryMultiSelect: vi.fn(),
}));

vi.mock("src/components/shared/category-multi-select", () => ({
	default: ({ disabled, value }: { disabled?: boolean; value: number[] }) => {
		syncedIndexerDialogMocks.categoryMultiSelect({ disabled, value });
		return <div data-testid="category-multi-select" />;
	},
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import SyncedIndexerEditDialog from "./synced-indexer-view-dialog";

const syncedIndexer = {
	apiKey: "secret",
	apiPath: "/api",
	backoffUntil: 0,
	baseUrl: "https://synced.example.com",
	categories: "[1000,2000]",
	configContract: "NewznabSettings",
	createdAt: 0,
	dailyGrabLimit: 4,
	dailyQueryLimit: 9,
	downloadClientId: 11,
	enableAutomaticSearch: true,
	enableInteractiveSearch: false,
	enableRss: true,
	enableSearch: true,
	escalationLevel: 0,
	id: 42,
	implementation: "Newznab",
	name: "Synced Indexer",
	priority: 13,
	protocol: "usenet",
	requestInterval: 7000,
	tag: "tv",
	updatedAt: 0,
} satisfies SyncedIndexer;

describe("SyncedIndexerEditDialog", () => {
	beforeEach(() => {
		syncedIndexerDialogMocks.categoryMultiSelect.mockReset();
	});

	it("does not render when no synced indexer is selected", () => {
		const { queryByTestId } = renderWithProviders(
			<SyncedIndexerEditDialog
				indexer={null}
				onOpenChange={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		expect(queryByTestId("dialog-root")).not.toBeInTheDocument();
	});

	it("hydrates the dialog and saves converted rate-limit values", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const onSave = vi.fn();

		const { getByDisplayValue, getByLabelText, getByRole } =
			renderWithProviders(
				<SyncedIndexerEditDialog
					downloadClients={[
						{ id: 11, name: "Usenet Client", protocol: "usenet" },
						{ id: 12, name: "Torrent Client", protocol: "torrent" },
					]}
					indexer={syncedIndexer}
					onOpenChange={onOpenChange}
					onSave={onSave}
				/>,
			);

		expect(
			getByRole("heading", { name: "Edit Synced Indexer" }),
		).toBeInTheDocument();
		expect(getByDisplayValue("Synced Indexer")).toBeInTheDocument();
		expect(getByDisplayValue("https://synced.example.com")).toBeInTheDocument();
		expect(getByDisplayValue("Newznab")).toBeInTheDocument();
		expect(getByDisplayValue("usenet")).toBeInTheDocument();
		expect(getByDisplayValue("13")).toBeInTheDocument();
		expect(getByRole("combobox")).toHaveTextContent("Usenet Client");
		expect(syncedIndexerDialogMocks.categoryMultiSelect).toHaveBeenCalledWith(
			expect.objectContaining({
				disabled: true,
				value: [1000, 2000],
			}),
		);

		await user.clear(getByLabelText("Tag (optional)"));
		await user.type(getByLabelText("Tag (optional)"), "anime");
		await user.clear(getByLabelText("Request Interval (s)"));
		await user.type(getByLabelText("Request Interval (s)"), "9");
		await user.clear(getByLabelText("Daily Query Limit"));
		await user.type(getByLabelText("Daily Query Limit"), "15");
		await user.clear(getByLabelText("Daily Grab Limit"));
		await user.type(getByLabelText("Daily Grab Limit"), "6");
		await user.click(getByRole("button", { name: "Save" }));

		expect(onSave).toHaveBeenCalledWith(42, 11, "anime", 9_000, 15, 6);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("cancels through the footer action", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();

		const { getByRole } = renderWithProviders(
			<SyncedIndexerEditDialog
				indexer={syncedIndexer}
				onOpenChange={onOpenChange}
				onSave={vi.fn()}
			/>,
		);

		await user.click(getByRole("button", { name: "Cancel" }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
