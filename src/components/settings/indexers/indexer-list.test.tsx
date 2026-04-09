import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const indexerListMocks = vi.hoisted(() => ({
	confirmDialog: vi.fn(),
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		loading,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		description: string;
		loading?: boolean;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}) => {
		indexerListMocks.confirmDialog({
			description,
			loading,
			open,
			title,
		});

		return open ? (
			<div data-testid="confirm-dialog">
				<p>{title}</p>
				<p>{description}</p>
				<button onClick={() => onOpenChange(false)} type="button">
					Cancel
				</button>
				<button disabled={loading} onClick={onConfirm} type="button">
					Confirm
				</button>
			</div>
		) : null;
	},
}));

import IndexerList from "./indexer-list";

type ManualIndexer = {
	id: number;
	name: string;
	implementation: string;
	protocol: string;
	baseUrl: string;
	apiPath: string | null;
	apiKey: string;
	categories: string | null;
	priority: number;
	enableRss: boolean;
	enableAutomaticSearch: boolean;
	enableInteractiveSearch: boolean;
	downloadClientId: number | null;
};

const manualAlpha: ManualIndexer = {
	apiKey: "alpha-key",
	apiPath: "/api",
	baseUrl: "https://alpha.example.com",
	categories: "[1000]",
	downloadClientId: null,
	enableAutomaticSearch: true,
	enableInteractiveSearch: true,
	enableRss: true,
	id: 1,
	implementation: "Newznab",
	name: "Alpha Manual",
	priority: 25,
	protocol: "usenet",
};

const manualBravo: ManualIndexer = {
	apiKey: "bravo-key",
	apiPath: "/api",
	baseUrl: "https://bravo.example.com",
	categories: "[2000]",
	downloadClientId: null,
	enableAutomaticSearch: false,
	enableInteractiveSearch: true,
	enableRss: false,
	id: 2,
	implementation: "Torznab",
	name: "Bravo Manual",
	priority: 30,
	protocol: "torrent",
};

const syncedCharlie: SyncedIndexer = {
	apiKey: "charlie-key",
	apiPath: "/api",
	backoffUntil: 0,
	baseUrl: "https://charlie.example.com",
	categories: "[3000]",
	configContract: "NewznabSettings",
	createdAt: 0,
	dailyGrabLimit: 0,
	dailyQueryLimit: 0,
	downloadClientId: 7,
	enableAutomaticSearch: true,
	enableInteractiveSearch: true,
	enableRss: true,
	enableSearch: true,
	escalationLevel: 0,
	id: 3,
	implementation: "Newznab",
	name: "Charlie Synced",
	priority: 15,
	protocol: "usenet",
	requestInterval: 5000,
	tag: "sync",
	updatedAt: 0,
};

const syncedDelta: SyncedIndexer = {
	apiKey: "delta-key",
	apiPath: "/api",
	backoffUntil: 0,
	baseUrl: "https://delta.example.com",
	categories: "[4000]",
	configContract: "TorznabSettings",
	createdAt: 0,
	dailyGrabLimit: 0,
	dailyQueryLimit: 0,
	downloadClientId: null,
	enableAutomaticSearch: false,
	enableInteractiveSearch: false,
	enableRss: false,
	enableSearch: true,
	escalationLevel: 0,
	id: 4,
	implementation: "Torznab",
	name: "Delta Synced",
	priority: 40,
	protocol: "torrent",
	requestInterval: 5000,
	tag: null,
	updatedAt: 0,
};

const syncedEcho: SyncedIndexer = {
	apiKey: "echo-key",
	apiPath: "/api",
	backoffUntil: 0,
	baseUrl: "https://echo.example.com",
	categories: "[5000]",
	configContract: "NewznabSettings",
	createdAt: 0,
	dailyGrabLimit: 0,
	dailyQueryLimit: 0,
	downloadClientId: null,
	enableAutomaticSearch: true,
	enableInteractiveSearch: false,
	enableRss: true,
	enableSearch: true,
	escalationLevel: 0,
	id: 5,
	implementation: "Newznab",
	name: "Echo Synced",
	priority: 10,
	protocol: "usenet",
	requestInterval: 5000,
	tag: null,
	updatedAt: 0,
};

function makeStatus(
	indexerId: number,
	indexerType: "manual" | "synced",
	overrides: Partial<{
		available: boolean;
		dailyGrabLimit: number;
		dailyQueryLimit: number;
		grabsUsed: number;
		queriesUsed: number;
		reason: "backoff" | "pacing" | "daily_query_limit" | "daily_grab_limit";
		waitMs: number;
	}> = {},
) {
	return {
		available: false,
		backoffUntil: 0,
		dailyGrabLimit: 0,
		dailyQueryLimit: 0,
		grabsUsed: 0,
		indexerId,
		indexerType,
		queriesUsed: 0,
		...overrides,
	} as const;
}

describe("IndexerList", () => {
	beforeEach(() => {
		indexerListMocks.confirmDialog.mockReset();
	});

	it("renders the empty state when there are no indexers", () => {
		const { getByText } = renderWithProviders(
			<IndexerList
				indexers={[]}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				onViewSynced={vi.fn()}
			/>,
		);

		expect(
			getByText("No indexers configured. Add one to get started."),
		).toBeInTheDocument();
	});

	it("sorts rows alphabetically and wires manual and synced actions", async () => {
		const user = userEvent.setup();
		const onEdit = vi.fn();
		const onDelete = vi.fn();
		const onViewSynced = vi.fn();

		const { getAllByRole, getByText } = renderWithProviders(
			<IndexerList
				indexers={[manualBravo, manualAlpha]}
				onDelete={onDelete}
				onEdit={onEdit}
				onViewSynced={onViewSynced}
				syncedIndexers={[syncedCharlie]}
			/>,
		);

		const rows = getAllByRole("row");
		expect(rows[1]).toHaveTextContent("Alpha Manual");
		expect(rows[2]).toHaveTextContent("Bravo Manual");
		expect(rows[3]).toHaveTextContent("Charlie Synced");
		expect(getByText("Prowlarr Sync")).toBeInTheDocument();

		await user.click(
			within(rows[1]).getAllByRole("button")[0] as HTMLButtonElement,
		);
		expect(onEdit).toHaveBeenCalledWith(manualAlpha);

		await user.click(within(rows[3]).getByRole("button") as HTMLButtonElement);
		expect(onViewSynced).toHaveBeenCalledWith(syncedCharlie);
	});

	it("renders supported rate-limit status badges", () => {
		const { getByText } = renderWithProviders(
			<IndexerList
				indexers={[manualAlpha, manualBravo]}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				onViewSynced={vi.fn()}
				statuses={[
					makeStatus(1, "manual", { available: true }),
					makeStatus(2, "manual", { reason: "backoff", waitMs: 3_660_000 }),
					makeStatus(3, "synced", {
						dailyQueryLimit: 10,
						queriesUsed: 7,
						reason: "daily_query_limit",
					}),
					makeStatus(4, "synced", {
						dailyGrabLimit: 8,
						grabsUsed: 2,
						reason: "daily_grab_limit",
					}),
					makeStatus(5, "synced", { reason: "pacing" }),
				]}
				syncedIndexers={[syncedCharlie, syncedDelta, syncedEcho]}
			/>,
		);

		expect(getByText("Available")).toBeInTheDocument();
		expect(getByText("Rate limited — 1h 1m")).toBeInTheDocument();
		expect(getByText("Daily limit (7/10)")).toBeInTheDocument();
		expect(getByText("Grab limit (2/8)")).toBeInTheDocument();
		expect(getByText("Pacing")).toBeInTheDocument();
	});

	it("opens delete confirmation and deletes the selected manual indexer", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn();

		const { getAllByRole, getByRole, getByTestId, getByText } =
			renderWithProviders(
				<IndexerList
					indexers={[manualAlpha]}
					onDelete={onDelete}
					onEdit={vi.fn()}
					onViewSynced={vi.fn()}
				/>,
			);

		await user.click(
			within(getAllByRole("row")[1]).getAllByRole(
				"button",
			)[1] as HTMLButtonElement,
		);

		expect(getByTestId("confirm-dialog")).toBeInTheDocument();
		expect(
			getByText(
				'Are you sure you want to delete "Alpha Manual"? This action cannot be undone.',
			),
		).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onDelete).toHaveBeenCalledWith(1);
	});
});
