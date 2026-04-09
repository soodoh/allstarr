import { fireEvent, screen } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMutation<TArg = unknown, TResult = unknown>(result?: TResult) {
	return {
		error: null as null | { message: string },
		isPending: false,
		mutate: vi.fn(
			(...args: [TArg, { onSuccess?: (value: TResult) => void }?]) =>
				args[1]?.onSuccess?.(result as TResult),
		),
	};
}

const indexersRouteMocks = vi.hoisted(() => ({
	createIndexer: createMutation(),
	deleteIndexer: createMutation(),
	indexerStatuses: [
		{
			available: true,
			indexerId: 1,
			indexerType: "manual",
		},
	],
	indexers: [
		{
			apiKey: "key",
			apiPath: null,
			baseUrl: "https://example.com",
			categories: "bad-json",
			dailyGrabLimit: null,
			dailyQueryLimit: null,
			downloadClientId: null,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			id: 1,
			implementation: "Newznab",
			name: "Books Indexer",
			priority: 25,
			protocol: "usenet",
			requestInterval: 5000,
			tag: null,
		},
	],
	syncedIndexers: [
		{
			apiKey: "synced",
			apiPath: "/api",
			baseUrl: "https://synced.example.com",
			categories: "[]",
			dailyGrabLimit: 0,
			dailyQueryLimit: 0,
			downloadClientId: 1,
			enableAutomaticSearch: true,
			enableInteractiveSearch: false,
			enableRss: true,
			id: 11,
			implementation: "Torznab",
			name: "Synced Indexer",
			priority: 50,
			protocol: "torrent",
			requestInterval: 10000,
			tag: "movies",
		},
	],
	updateSyncedIndexer: createMutation(),
	updateIndexer: createMutation(),
	downloadClients: [
		{
			id: 1,
			name: "Main Client",
			protocol: "usenet",
		},
	],
	useQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			indexersRouteMocks.useQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			indexersRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		actions,
		description,
		title,
	}: {
		actions?: ReactNode;
		description?: ReactNode;
		title: string;
	}) => (
		<div data-testid="page-header">
			<h1>{title}</h1>
			{description ? <p>{description}</p> : null}
			{actions}
		</div>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type ?? "button"}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog">{children}</div> : null,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/settings/indexers/indexer-list", () => ({
	default: ({
		indexers,
		onDelete,
		onEdit,
		onViewSynced,
		syncedIndexers,
		statuses,
	}: {
		indexers: Array<{ id: number; name: string }>;
		onDelete: (id: number) => void;
		onEdit: (indexer: { id: number }) => void;
		onViewSynced: (indexer: { id: number }) => void;
		syncedIndexers?: Array<{ id: number; name: string }>;
		statuses?: Array<{ indexerId: number }>;
	}) => (
		<div data-testid="indexer-list">
			<div data-testid="indexer-count">{indexers.length}</div>
			<div data-testid="synced-count">{syncedIndexers?.length ?? 0}</div>
			<div data-testid="status-count">{statuses?.length ?? 0}</div>
			{indexers.map((indexer) => (
				<div key={indexer.id}>
					<span>{indexer.name}</span>
					<button type="button" onClick={() => onEdit({ id: indexer.id })}>
						edit
					</button>
					<button type="button" onClick={() => onDelete(indexer.id)}>
						delete
					</button>
				</div>
			))}
			{syncedIndexers?.map((indexer) => (
				<div key={indexer.id}>
					<span>{indexer.name}</span>
					<button
						type="button"
						onClick={() => onViewSynced({ id: indexer.id })}
					>
						view-synced
					</button>
				</div>
			))}
		</div>
	),
}));

vi.mock(
	"src/components/settings/indexers/indexer-implementation-select",
	() => ({
		default: ({
			onCancel,
			onSelect,
		}: {
			onCancel: () => void;
			onSelect: (selection: {
				implementation: string;
				protocol: string;
			}) => void;
		}) => (
			<div data-testid="indexer-implementation-select">
				<button
					type="button"
					onClick={() =>
						onSelect({ implementation: "Newznab", protocol: "usenet" })
					}
				>
					Newznab
				</button>
				<button
					type="button"
					onClick={() =>
						onSelect({ implementation: "Torznab", protocol: "torrent" })
					}
				>
					Torznab
				</button>
				<button type="button" onClick={onCancel}>
					cancel
				</button>
			</div>
		),
	}),
);

vi.mock("src/components/settings/indexers/indexer-form", () => ({
	default: ({
		initialValues,
		implementation,
		onCancel,
		onSubmit,
		protocol,
	}: {
		implementation: string;
		initialValues?: {
			categories?: number[];
			name?: string;
			requestInterval?: number;
		};
		onCancel: () => void;
		onSubmit: (values: Record<string, unknown>) => void;
		protocol: string;
	}) => (
		<div data-testid="indexer-form">
			<div data-testid="indexer-form-implementation">{implementation}</div>
			<div data-testid="indexer-form-protocol">{protocol}</div>
			<div data-testid="indexer-form-categories">
				{String(initialValues?.categories?.length ?? 0)}
			</div>
			<div data-testid="indexer-form-request-interval">
				{String(initialValues?.requestInterval ?? 0)}
			</div>
			<button
				type="button"
				onClick={() =>
					onSubmit({
						apiKey: "api",
						apiPath: "/api",
						baseUrl: "https://example.com",
						categories: [10, 20],
						dailyGrabLimit: 3,
						dailyQueryLimit: 5,
						downloadClientId: null,
						enableAutomaticSearch: true,
						enableInteractiveSearch: false,
						enableRss: true,
						implementation,
						name: "Form Indexer",
						priority: 25,
						protocol,
						requestInterval: 5000,
						tag: "",
					})
				}
			>
				submit
			</button>
			<button type="button" onClick={onCancel}>
				cancel
			</button>
		</div>
	),
}));

vi.mock("src/components/settings/indexers/synced-indexer-view-dialog", () => ({
	default: ({
		indexer,
		loading,
		onOpenChange,
		onSave,
	}: {
		indexer: { id: number } | null;
		loading?: boolean;
		onOpenChange: (open: boolean) => void;
		onSave: (
			id: number,
			downloadClientId: number | null,
			tag: string | null,
			requestInterval: number,
			dailyQueryLimit: number,
			dailyGrabLimit: number,
		) => void;
	}) =>
		indexer ? (
			<div data-testid="synced-dialog">
				<div data-testid="synced-dialog-loading">
					{String(Boolean(loading))}
				</div>
				<button
					type="button"
					onClick={() => onSave(indexer.id, 1, "movies", 15, 2, 1)}
				>
					save
				</button>
				<button type="button" onClick={() => onOpenChange(false)}>
					close
				</button>
			</div>
		) : null,
}));

vi.mock("src/hooks/mutations", () => ({
	useCreateIndexer: () => indexersRouteMocks.createIndexer,
	useDeleteIndexer: () => indexersRouteMocks.deleteIndexer,
	useUpdateIndexer: () => indexersRouteMocks.updateIndexer,
	useUpdateSyncedIndexer: () => indexersRouteMocks.updateSyncedIndexer,
}));

vi.mock("src/lib/queries", () => ({
	downloadClientsListQuery: () => ({ queryKey: ["download-clients", "list"] }),
	indexerStatusesQuery: () => ({ queryKey: ["indexer-statuses", "list"] }),
	indexersListQuery: () => ({ queryKey: ["indexers", "list"] }),
	syncedIndexersListQuery: () => ({ queryKey: ["synced-indexers", "list"] }),
}));

import { Route } from "./indexers";

describe("indexers route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		indexersRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey?: string[] }) => {
				if (query.queryKey?.[0] === "indexers") {
					return { data: indexersRouteMocks.indexers };
				}
				return { data: indexersRouteMocks.downloadClients };
			},
		);
		indexersRouteMocks.useQuery.mockImplementation(
			(query: { queryKey?: string[] }) => {
				if (query.queryKey?.[0] === "synced-indexers") {
					return { data: indexersRouteMocks.syncedIndexers };
				}
				return { data: indexersRouteMocks.indexerStatuses };
			},
		);
	});

	it("loads the route queries and wires add, edit, synced, and delete actions", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
			component: () => JSX.Element;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["indexers", "list"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["download-clients", "list"] }),
		);

		renderWithProviders(<routeConfig.component />);

		expect(screen.getByTestId("indexer-count")).toHaveTextContent("1");
		expect(screen.getByTestId("synced-count")).toHaveTextContent("1");
		expect(screen.getByTestId("status-count")).toHaveTextContent("1");

		fireEvent.click(screen.getByRole("button", { name: "Add Indexer" }));
		expect(
			screen.getByTestId("indexer-implementation-select"),
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Torznab" }));
		expect(screen.getByTestId("indexer-form")).toBeInTheDocument();
		expect(
			screen.getByTestId("indexer-form-request-interval"),
		).toHaveTextContent("0");
		fireEvent.click(screen.getByRole("button", { name: "submit" }));
		expect(indexersRouteMocks.createIndexer.mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Form Indexer",
				tag: null,
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "edit" }));
		expect(screen.getByTestId("indexer-form-implementation")).toHaveTextContent(
			"Newznab",
		);
		expect(screen.getByTestId("indexer-form-categories")).toHaveTextContent(
			"0",
		);
		expect(
			screen.getByTestId("indexer-form-request-interval"),
		).toHaveTextContent("5");
		fireEvent.click(screen.getByRole("button", { name: "submit" }));
		expect(indexersRouteMocks.updateIndexer.mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				tag: null,
			}),
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "view-synced" }));
		expect(screen.getByTestId("synced-dialog")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(indexersRouteMocks.updateSyncedIndexer.mutate).toHaveBeenCalledWith(
			{
				dailyGrabLimit: 1,
				dailyQueryLimit: 2,
				downloadClientId: 1,
				id: 11,
				requestInterval: 15,
				tag: "movies",
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(screen.queryByTestId("synced-dialog")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "delete" }));
		expect(indexersRouteMocks.deleteIndexer.mutate).toHaveBeenCalledWith(1);
	});
});
