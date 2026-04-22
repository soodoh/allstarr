import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const importsRouteMocks = vi.hoisted(() => ({
	createImportSourceFn: vi.fn(),
	deleteImportSourceFn: vi.fn(),
	importSourcesQuery: vi.fn(),
	refreshImportSourceFn: vi.fn(),
	deleteMutationState: {
		isPending: false,
		variables: null as null | { id: number },
	},
	refreshMutationState: {
		isPending: false,
		variables: null as null | { id: number },
	},
	updateImportSourceFn: vi.fn(),
	sources: [
		{
			baseUrl: "http://localhost:8989",
			createdAt: new Date("2026-04-21T00:00:00.000Z"),
			hasApiKey: true,
			id: 1,
			kind: "sonarr",
			label: "Sonarr",
			lastSyncError: null,
			lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
			lastSyncStatus: "synced",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		},
		{
			baseUrl: "http://localhost:7878",
			createdAt: new Date("2026-04-20T00:00:00.000Z"),
			hasApiKey: true,
			id: 2,
			kind: "radarr",
			label: "Radarr",
			lastSyncError: null,
			lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
			lastSyncStatus: "synced",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		},
	] as Array<{
		baseUrl: string;
		createdAt: Date;
		hasApiKey: boolean;
		id: number;
		kind: string;
		label: string;
		lastSyncError: string | null;
		lastSyncedAt: Date | null;
		lastSyncStatus: string;
		updatedAt: Date;
	}>,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: () => ({
			data: importsRouteMocks.sources,
			status: "success",
		}),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/lib/admin-route", () => ({
	requireAdminBeforeLoad: ({
		context,
	}: {
		context: { session: { user: { role?: string | null } } };
	}) => {
		if (context.session.user.role !== "admin") {
			throw new Error("redirect:/");
		}
	},
}));

vi.mock("src/lib/queries", () => ({
	importSourcesQuery: importsRouteMocks.importSourcesQuery,
}));

vi.mock("src/hooks/mutations/imports", () => ({
	useCreateImportSource: () => ({
		isPending: false,
		mutate: (
			payload: Record<string, unknown>,
			options?: { onSuccess?: () => void },
		) => {
			importsRouteMocks.createImportSourceFn(payload);
			options?.onSuccess?.();
		},
	}),
	useDeleteImportSource: () => ({
		isPending: importsRouteMocks.deleteMutationState.isPending,
		mutate: (
			payload: Record<string, unknown>,
			options?: { onSuccess?: () => void },
		) => {
			importsRouteMocks.deleteImportSourceFn(payload);
			options?.onSuccess?.();
		},
		variables: importsRouteMocks.deleteMutationState.variables,
	}),
	useRefreshImportSource: () => ({
		isPending: importsRouteMocks.refreshMutationState.isPending,
		mutate: (
			payload: Record<string, unknown>,
			options?: { onSuccess?: () => void },
		) => {
			importsRouteMocks.refreshImportSourceFn(payload);
			options?.onSuccess?.();
		},
		variables: importsRouteMocks.refreshMutationState.variables,
	}),
	useUpdateImportSource: () => ({
		isPending: false,
		mutate: (
			payload: Record<string, unknown>,
			options?: { onSuccess?: () => void },
		) => {
			importsRouteMocks.updateImportSourceFn(payload);
			options?.onSuccess?.();
		},
	}),
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: ReactNode;
		title: string;
	}) => (
		<header data-testid="page-header">
			<h1>{title}</h1>
			{description ? <p>{description}</p> : null}
		</header>
	),
}));

vi.mock("src/components/settings/imports/import-sources-list", () => ({
	default: ({
		onAddSource,
		onDeleteSource,
		onEditSource,
		onRefreshSource,
		onSelectSource,
		selectedSourceId,
		sources,
	}: {
		onAddSource: () => void;
		onDeleteSource: (id: number) => void;
		onEditSource: (source: { id: number; label: string }) => void;
		onRefreshSource: (id: number) => void;
		onSelectSource: (id: number) => void;
		selectedSourceId: number | null;
		sources: Array<{ id: number; label: string }>;
	}) => (
		<div data-testid="sources-list" data-selected={selectedSourceId ?? "none"}>
			<button onClick={onAddSource} type="button">
				Add source
			</button>
			{sources.map((source) => (
				<div key={source.id}>
					<button onClick={() => onSelectSource(source.id)} type="button">
						{source.label}
					</button>
					<button onClick={() => onEditSource(source)} type="button">
						Edit {source.label}
					</button>
					<button onClick={() => onRefreshSource(source.id)} type="button">
						Refresh {source.label}
					</button>
					<button onClick={() => onDeleteSource(source.id)} type="button">
						Delete {source.label}
					</button>
				</div>
			))}
		</div>
	),
}));

vi.mock("src/components/settings/imports/import-plan-table", () => ({
	default: ({ selectedSourceId }: { selectedSourceId: number | null }) => (
		<div data-testid="plan-table">
			selected-source:{selectedSourceId ?? "none"}
		</div>
	),
}));

vi.mock("src/components/settings/imports/import-review-panel", () => ({
	default: ({ selectedSourceId }: { selectedSourceId: number | null }) => (
		<div data-testid="review-panel">
			selected-source:{selectedSourceId ?? "none"}
		</div>
	),
}));

vi.mock("src/components/settings/imports/import-source-dialog", () => ({
	default: ({
		loading,
		open,
		onOpenChange,
		onSubmit,
		source,
	}: {
		loading?: boolean;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onSubmit: (values: {
			apiKey: string;
			baseUrl: string;
			kind: string;
			label: string;
		}) => void;
		source: { id: number; label: string } | null;
	}) =>
		open ? (
			<div data-testid="source-dialog">
				<div data-testid="dialog-mode">
					{source ? `edit-${source.id}` : "create"}
				</div>
				<button onClick={() => onOpenChange(false)} type="button">
					Close
				</button>
				<button
					disabled={loading}
					onClick={() =>
						onSubmit({
							apiKey: "dialog-key",
							baseUrl: "http://localhost:9999",
							kind: source ? "radarr" : "sonarr",
							label: source ? `${source.label} Updated` : "Bookshelf",
						})
					}
					type="button"
				>
					Submit
				</button>
			</div>
		) : null,
}));

import { Route } from "./imports";

describe("imports settings route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		importsRouteMocks.sources = [
			{
				baseUrl: "http://localhost:8989",
				createdAt: new Date("2026-04-21T00:00:00.000Z"),
				hasApiKey: true,
				id: 1,
				kind: "sonarr",
				label: "Sonarr",
				lastSyncError: null,
				lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
				lastSyncStatus: "synced",
				updatedAt: new Date("2026-04-21T00:00:00.000Z"),
			},
			{
				baseUrl: "http://localhost:7878",
				createdAt: new Date("2026-04-20T00:00:00.000Z"),
				hasApiKey: true,
				id: 2,
				kind: "radarr",
				label: "Radarr",
				lastSyncError: null,
				lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
				lastSyncStatus: "synced",
				updatedAt: new Date("2026-04-21T00:00:00.000Z"),
			},
		];
		importsRouteMocks.refreshMutationState.isPending = false;
		importsRouteMocks.refreshMutationState.variables = null;
		importsRouteMocks.deleteMutationState.isPending = false;
		importsRouteMocks.deleteMutationState.variables = null;
		importsRouteMocks.importSourcesQuery.mockReturnValue({
			queryKey: ["imports", "sources"],
		});
	});

	it("enforces admin access, loads sources, and wires the tabbed page", async () => {
		const route = Route as unknown as {
			beforeLoad: (input: {
				context: { session: { user: { role?: string | null } } };
			}) => void;
			component: () => ReactNode;
			loader: (input: {
				context: {
					queryClient: { ensureQueryData: (query: unknown) => unknown };
				};
			}) => Promise<unknown>;
		};

		expect(() =>
			route.beforeLoad({
				context: { session: { user: { role: "member" } } },
			}),
		).toThrow("redirect:/");

		const ensureQueryData = vi.fn();
		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(importsRouteMocks.importSourcesQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["imports", "sources"] }),
		);

		const Component = route.component;
		await renderWithProviders(<Component />);

		await expect
			.element(page.getByRole("heading", { name: "Imports" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("tab", { name: "Sources" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("tab", { name: "Plan" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("tab", { name: "Review" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("sources-list"))
			.toHaveAttribute("data-selected", "1");
		await expect.element(page.getByTestId("sources-list")).toBeInTheDocument();

		await page.getByRole("button", { name: "Radarr", exact: true }).click();

		await page.getByRole("tab", { name: "Plan" }).click();
		await expect
			.element(page.getByTestId("plan-table"))
			.toHaveTextContent("selected-source:2");
		await page.getByRole("tab", { name: "Review" }).click();
		await expect
			.element(page.getByTestId("review-panel"))
			.toHaveTextContent("selected-source:2");
		await page.getByRole("tab", { name: "Sources" }).click();

		await page.getByRole("button", { name: "Refresh Sonarr" }).click();
		expect(importsRouteMocks.refreshImportSourceFn).toHaveBeenCalledWith({
			id: 1,
		});

		await page.getByRole("button", { name: "Edit Sonarr" }).click();
		await expect.element(page.getByTestId("source-dialog")).toBeInTheDocument();
		await expect
			.element(page.getByTestId("dialog-mode"))
			.toHaveTextContent("edit-1");
		await page.getByRole("button", { name: "Submit" }).click();
		expect(importsRouteMocks.updateImportSourceFn).toHaveBeenCalledWith({
			apiKey: "dialog-key",
			baseUrl: "http://localhost:9999",
			id: 1,
			kind: "radarr",
			label: "Sonarr Updated",
		});
		await expect
			.element(page.getByTestId("source-dialog"))
			.not.toBeInTheDocument();

		await page.getByRole("button", { name: "Add source" }).click();
		await expect
			.element(page.getByTestId("dialog-mode"))
			.toHaveTextContent("create");
		await page.getByRole("button", { name: "Submit" }).click();
		expect(importsRouteMocks.createImportSourceFn).toHaveBeenCalledWith({
			apiKey: "dialog-key",
			baseUrl: "http://localhost:9999",
			kind: "sonarr",
			label: "Bookshelf",
		});
		await expect
			.element(page.getByTestId("source-dialog"))
			.not.toBeInTheDocument();

		await page.getByRole("button", { name: "Delete Radarr" }).click();
		expect(importsRouteMocks.deleteImportSourceFn).toHaveBeenCalledWith({
			id: 2,
		});
	});

	it("only auto-selects ready sources and ignores stale mutation variables", async () => {
		importsRouteMocks.sources = [
			{
				baseUrl: "http://localhost:7878",
				createdAt: new Date("2026-04-20T00:00:00.000Z"),
				hasApiKey: true,
				id: 2,
				kind: "radarr",
				label: "Radarr",
				lastSyncError: "Source API error: 401 Unauthorized",
				lastSyncedAt: null,
				lastSyncStatus: "error",
				updatedAt: new Date("2026-04-21T00:00:00.000Z"),
			},
			{
				baseUrl: "http://localhost:8989",
				createdAt: new Date("2026-04-21T00:00:00.000Z"),
				hasApiKey: true,
				id: 1,
				kind: "sonarr",
				label: "Sonarr",
				lastSyncError: null,
				lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
				lastSyncStatus: "synced",
				updatedAt: new Date("2026-04-21T00:00:00.000Z"),
			},
		];
		importsRouteMocks.refreshMutationState.isPending = false;
		importsRouteMocks.refreshMutationState.variables = { id: 2 };
		importsRouteMocks.deleteMutationState.isPending = false;
		importsRouteMocks.deleteMutationState.variables = { id: 2 };

		const route = Route as unknown as {
			component: () => ReactNode;
		};

		await renderWithProviders(<route.component />);

		await expect
			.element(page.getByTestId("sources-list"))
			.toHaveAttribute("data-selected", "1");
		await page.getByRole("button", { name: "Radarr", exact: true }).click();
		await page.getByRole("tab", { name: "Plan" }).click();
		await expect
			.element(page.getByTestId("plan-table"))
			.toHaveTextContent("selected-source:1");
	});
});
