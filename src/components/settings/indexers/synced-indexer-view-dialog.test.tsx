import type { ReactNode } from "react";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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

	it("does not render when no synced indexer is selected", async () => {
		await renderWithProviders(
			<SyncedIndexerEditDialog
				indexer={null}
				onOpenChange={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		await expect
			.element(page.getByTestId("dialog-root"))
			.not.toBeInTheDocument();
	});

	it("hydrates the dialog and saves converted rate-limit values", async () => {
		const onOpenChange = vi.fn();
		const onSave = vi.fn();

		await renderWithProviders(
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

		await expect
			.element(page.getByRole("heading", { name: "Edit Synced Indexer" }))
			.toBeInTheDocument();
		// Disabled fields use Label without htmlFor, so verify via input values
		const nameInput = (await page.getByText("Name").element())
			.closest(".space-y-2")
			?.querySelector("input") as HTMLInputElement;
		expect(nameInput.value).toBe("Synced Indexer");

		const baseUrlInput = (await page.getByText("Base URL").element())
			.closest(".space-y-2")
			?.querySelector("input") as HTMLInputElement;
		expect(baseUrlInput.value).toBe("https://synced.example.com");

		const implInput = (await page.getByText("Implementation").element())
			.closest(".space-y-2")
			?.querySelector("input") as HTMLInputElement;
		expect(implInput.value).toBe("Newznab");

		const protocolInput = (await page.getByText("Protocol").element())
			.closest(".space-y-2")
			?.querySelector("input") as HTMLInputElement;
		expect(protocolInput.value).toBe("usenet");

		const priorityInput = (await page.getByText("Priority").element())
			.closest(".space-y-2")
			?.querySelector("input") as HTMLInputElement;
		expect(priorityInput.value).toBe("13");
		await expect
			.element(page.getByRole("combobox"))
			.toHaveTextContent("Usenet Client");
		expect(syncedIndexerDialogMocks.categoryMultiSelect).toHaveBeenCalledWith(
			expect.objectContaining({
				disabled: true,
				value: [1000, 2000],
			}),
		);

		await page.getByLabelText("Tag (optional)").clear();
		await page.getByLabelText("Tag (optional)").fill("anime");
		await page.getByLabelText("Request Interval (s)").clear();
		await page.getByLabelText("Request Interval (s)").fill("9");
		await page.getByLabelText("Daily Query Limit").clear();
		await page.getByLabelText("Daily Query Limit").fill("15");
		await page.getByLabelText("Daily Grab Limit").clear();
		await page.getByLabelText("Daily Grab Limit").fill("6");
		await page.getByRole("button", { name: "Save" }).click();

		expect(onSave).toHaveBeenCalledWith(42, 11, "anime", 9_000, 15, 6);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("cancels through the footer action", async () => {
		const onOpenChange = vi.fn();

		await renderWithProviders(
			<SyncedIndexerEditDialog
				indexer={syncedIndexer}
				onOpenChange={onOpenChange}
				onSave={vi.fn()}
			/>,
		);

		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
