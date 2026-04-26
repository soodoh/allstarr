import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

function createMutation() {
	return {
		isPending: false,
		mutate: vi.fn(),
	};
}

const settingsRouteMocks = vi.hoisted(() => ({
	createDownloadClient: createMutation(),
	createDownloadFormat: createMutation(),
	createDownloadProfile: createMutation(),
	createIndexer: createMutation(),
	createCustomFormat: createMutation(),
	deleteCustomFormat: createMutation(),
	deleteDownloadClient: createMutation(),
	deleteDownloadFormat: createMutation(),
	deleteDownloadProfile: createMutation(),
	deleteIndexer: createMutation(),
	duplicateCustomFormat: createMutation(),
	regenerateApiKey: createMutation(),
	bulkSetProfileCFScores: createMutation(),
	getBookImportExclusionsFn: vi.fn(async () => ({ items: [] })),
	getMovieImportExclusionsFn: vi.fn(async () => ({ items: [] })),
	getServerCwdFn: vi.fn(async () => "/srv"),
	importCustomFormatsFn: vi.fn(async () => ({ imported: 0, skipped: 0 })),
	indexerStatuses: [],
	indexers: [
		{
			apiKey: "key",
			apiPath: "/api",
			baseUrl: "https://example.com",
			categories: "[]",
			dailyQueryLimit: null,
			dailyGrabLimit: null,
			downloadClientId: null,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			id: 1,
			implementation: "Newznab",
			name: "Indexer",
			priority: 25,
			protocol: "usenet",
			requestInterval: 5000,
			tag: null,
		},
	],
	downloadClients: [
		{
			apiKey: null,
			category: "movies",
			enabled: true,
			host: "localhost",
			id: 1,
			implementation: "qBittorrent",
			name: "qBittorrent",
			password: null,
			port: 8080,
			priority: 1,
			protocol: "torrent",
			removeCompletedDownloads: true,
			settings: null,
			tag: null,
			urlBase: null,
			useSsl: false,
			username: null,
		},
	],
	downloadFormats: [
		{
			color: "gray",
			contentTypes: ["movie"],
			defaultScore: 0,
			description: "",
			id: 1,
			includeInRenaming: false,
			name: "Bluray",
			noMaxLimit: 0,
			noPreferredLimit: 0,
			preferredSize: 0,
			resolution: 1080,
			specificity: 0,
			source: null,
			title: "Bluray",
			weight: 100,
		},
	],
	downloadProfiles: [
		{
			categories: [],
			contentType: "ebook",
			cutoff: 1,
			icon: "book",
			id: 1,
			items: [],
			language: "en",
			minCustomFormatScore: 0,
			name: "Default",
			rootFolderPath: "/srv/books",
			upgradeAllowed: true,
			upgradeUntilCustomFormatScore: 0,
		},
	],
	downloadProfilesLoaderData: { serverCwd: "/srv" },
	exportCustomFormatsFn: vi.fn(async () => ({ customFormats: [] })),
	getBookImportExclusionsResult: { items: [] },
	getMovieImportExclusionsResult: { items: [] },
	indexersListQueryResult: [],
	importBookExclusionMutation: createMutation(),
	importMovieExclusionMutation: createMutation(),
	invalidateQueries: vi.fn(),
	languageSelectChange: vi.fn(),
	metadataProfile: {
		minimumPages: 0,
		minimumPopularity: 0,
		skipCompilations: false,
		skipMissingIsbnAsin: false,
		skipMissingReleaseDate: false,
	},
	removeBookImportExclusionFn: vi.fn(async () => undefined),
	removeDownloadClient: vi.fn(),
	removeDownloadFormat: vi.fn(),
	removeDownloadProfile: vi.fn(),
	removeIndexer: vi.fn(),
	removeMovieImportExclusionFn: vi.fn(async () => undefined),
	settingsMap: {
		"general.apiKey": "old-api-key",
		"general.logLevel": "warn",
		"metadata.tmdb.includeAdult": false,
		"metadata.tmdb.language": "en",
		"metadata.tmdb.region": "",
		"format.audiobook.defaultDuration": 600,
		"format.ebook.defaultPageCount": 300,
		"format.movie.defaultRuntime": 130,
		"format.tv.defaultEpisodeRuntime": 45,
	},
	settingsNavItems: [
		{
			description: "General server configuration.",
			icon: ({ className }: { className?: string }) => (
				<span className={className} data-testid="settings-icon-general" />
			),
			title: "General",
			to: "/settings/general",
		},
		{
			description: "Download format defaults.",
			icon: ({ className }: { className?: string }) => (
				<span className={className} data-testid="settings-icon-formats" />
			),
			title: "Formats",
			to: "/settings/formats",
		},
		{
			description: "Source connectors and review queue.",
			icon: ({ className }: { className?: string }) => (
				<span className={className} data-testid="settings-icon-imports" />
			),
			title: "Imports",
			to: "/settings/imports",
		},
		{
			description: "Connected clients.",
			icon: ({ className }: { className?: string }) => (
				<span className={className} data-testid="settings-icon-clients" />
			),
			title: "Download Clients",
			to: "/settings/download-clients",
		},
	],
	syncedIndexers: [],
	validateForm: vi.fn((_schema?: unknown, _data?: unknown) => ({
		success: true,
		data: {},
		errors: null,
	})),
	updateCustomFormat: createMutation(),
	updateDownloadClient: createMutation(),
	updateDownloadFormat: createMutation(),
	updateDownloadProfile: createMutation(),
	updateIndexer: createMutation(),
	updateMetadataProfile: createMutation(),
	updateSettingFn: vi.fn(async () => undefined),
	updateSettings: createMutation(),
	updateSyncedIndexer: createMutation(),
	downloadClientsListQuery: vi.fn(),
	downloadFormatsListQuery: vi.fn(),
	downloadProfilesListQuery: vi.fn(),
	customFormatsListQuery: vi.fn(),
	indexerStatusesQuery: vi.fn(),
	indexersListQuery: vi.fn(),
	metadataProfileQuery: vi.fn(),
	settingsMapQuery: vi.fn(),
	syncedIndexersListQuery: vi.fn(),
	useMutation: vi.fn((..._args: unknown[]) => createMutation()),
	useQuery: vi.fn(),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: settingsRouteMocks.invalidateQueries,
	})),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useMutation: () => settingsRouteMocks.useMutation(),
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			settingsRouteMocks.useQuery(...args),
		useQueryClient: () => settingsRouteMocks.useQueryClient(),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			settingsRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to: string }) => (
		<a href={to} data-testid={`link-${to}`}>
			{children}
		</a>
	),
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		onConfirm,
		open,
		title,
	}: {
		description: string;
		onConfirm?: () => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<span>{title}</span>
				<span>{description}</span>
				<button onClick={() => onConfirm?.()} type="button">
					confirm
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="empty-state">
			<div data-testid="empty-state-title">{title}</div>
			<div data-testid="empty-state-description">{description}</div>
		</div>
	),
}));

vi.mock("src/components/shared/language-single-select", () => ({
	default: ({ value }: { value: string }) => (
		<div data-testid="language-select">{value}</div>
	),
}));

vi.mock("src/components/settings/custom-formats/custom-format-form", () => ({
	default: ({
		initialValues,
		onCancel,
		onSubmit,
		serverError,
	}: {
		initialValues?: { id?: number; name?: string };
		onCancel: () => void;
		onSubmit: () => void;
		serverError?: string;
	}) => (
		<div data-testid="custom-format-form">
			<div data-testid="custom-format-form-initial">
				{initialValues?.name ?? "new"}
			</div>
			{serverError ? (
				<div data-testid="custom-format-form-error">{serverError}</div>
			) : null}
			<button onClick={onCancel} type="button">
				cancel
			</button>
			<button onClick={() => onSubmit()} type="button">
				submit
			</button>
		</div>
	),
}));

vi.mock("src/components/settings/custom-formats/custom-format-list", () => ({
	default: ({ customFormats }: { customFormats: Array<{ id: number }> }) => (
		<div data-testid="custom-format-list">{customFormats.length}</div>
	),
}));

vi.mock(
	"src/components/settings/download-clients/download-client-form",
	() => ({
		default: ({
			initialValues,
			onCancel,
			onSubmit,
		}: {
			initialValues?: { implementation?: string };
			onCancel: () => void;
			onSubmit: () => void;
		}) => (
			<div data-testid="download-client-form">
				<div data-testid="download-client-form-implementation">
					{initialValues?.implementation ?? "new"}
				</div>
				<button onClick={onCancel} type="button">
					cancel
				</button>
				<button onClick={() => onSubmit()} type="button">
					submit
				</button>
			</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-clients/download-client-list",
	() => ({
		default: ({ clients }: { clients: Array<{ id: number }> }) => (
			<div data-testid="download-client-list">{clients.length}</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-clients/implementation-select",
	() => ({
		default: ({
			onCancel,
			onSelect,
		}: {
			onCancel: () => void;
			onSelect: (impl: string) => void;
		}) => (
			<div data-testid="download-client-implementation-select">
				<button onClick={onCancel} type="button">
					cancel
				</button>
				<button onClick={() => onSelect("qBittorrent")} type="button">
					qBittorrent
				</button>
			</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-formats/download-format-form",
	() => ({
		default: ({
			defaultContentTypes,
			initialValues,
			onCancel,
			onSubmit,
		}: {
			defaultContentTypes: Array<string>;
			initialValues?: { title?: string };
			onCancel: () => void;
			onSubmit: () => void;
		}) => (
			<div data-testid="download-format-form">
				<div data-testid="download-format-form-default-content-types">
					{defaultContentTypes.join(",")}
				</div>
				<div data-testid="download-format-form-initial">
					{initialValues?.title ?? "new"}
				</div>
				<button onClick={onCancel} type="button">
					cancel
				</button>
				<button onClick={() => onSubmit()} type="button">
					submit
				</button>
			</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-formats/download-format-list",
	() => ({
		default: ({ definitions }: { definitions: Array<{ id: number }> }) => (
			<div data-testid="download-format-list">{definitions.length}</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-profiles/download-profile-form",
	() => ({
		default: ({
			onCancel,
			serverCwd,
		}: {
			onCancel: () => void;
			serverCwd: string;
		}) => (
			<div data-testid="download-profile-form">
				<div data-testid="download-profile-form-server-cwd">{serverCwd}</div>
				<button onClick={onCancel} type="button">
					cancel
				</button>
			</div>
		),
	}),
);

vi.mock(
	"src/components/settings/download-profiles/download-profile-list",
	() => ({
		default: ({ profiles }: { profiles: Array<{ id: number }> }) => (
			<div data-testid="download-profile-list">{profiles.length}</div>
		),
	}),
);

vi.mock("src/components/settings/indexers/indexer-form", () => ({
	default: ({
		initialValues,
		onCancel,
		onSubmit,
	}: {
		initialValues?: { name?: string };
		onCancel: () => void;
		onSubmit: () => void;
	}) => (
		<div data-testid="indexer-form">
			<div data-testid="indexer-form-initial">
				{initialValues?.name ?? "new"}
			</div>
			<button onClick={onCancel} type="button">
				cancel
			</button>
			<button onClick={() => onSubmit()} type="button">
				submit
			</button>
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
			onSelect: (value: { implementation: string; protocol: string }) => void;
		}) => (
			<div data-testid="indexer-implementation-select">
				<button onClick={onCancel} type="button">
					cancel
				</button>
				<button
					onClick={() =>
						onSelect({ implementation: "Newznab", protocol: "usenet" })
					}
					type="button"
				>
					Newznab
				</button>
			</div>
		),
	}),
);

vi.mock("src/components/settings/indexers/indexer-list", () => ({
	default: ({ indexers }: { indexers: Array<{ id: number }> }) => (
		<div data-testid="indexer-list">{indexers.length}</div>
	),
}));

vi.mock("src/components/settings/indexers/synced-indexer-view-dialog", () => ({
	default: () => <div data-testid="synced-indexer-dialog" />,
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
		<header data-testid="page-header">
			<div data-testid="page-header-title">{title}</div>
			{description ? (
				<div data-testid="page-header-description">{description}</div>
			) : null}
			{actions}
		</header>
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

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	CardHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog">{children}</div> : null,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("src/components/ui/input", () => ({
	default: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input {...props} />
	),
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor?: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectValue: () => <div />,
}));

vi.mock("src/components/ui/sheet", () => ({
	Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <aside data-testid="sheet">{children}</aside> : null,
	SheetContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SheetDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	SheetHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	SheetTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<button
			data-checked={String(checked)}
			onClick={() => onCheckedChange(!checked)}
			type="button"
		>
			switch
		</button>
	),
}));

vi.mock("src/components/ui/table", () => ({
	Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
	TableBody: ({ children }: { children: ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
	TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
	TableHeader: ({ children }: { children: ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));

vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children: ReactNode }) => (
		<button type="button">{children}</button>
	),
}));

vi.mock("src/hooks/mutations", () => ({
	useCreateDownloadClient: () => settingsRouteMocks.createDownloadClient,
	useCreateDownloadFormat: () => settingsRouteMocks.createDownloadFormat,
	useCreateDownloadProfile: () => settingsRouteMocks.createDownloadProfile,
	useCreateIndexer: () => settingsRouteMocks.createIndexer,
	useDeleteDownloadClient: () => settingsRouteMocks.deleteDownloadClient,
	useDeleteDownloadFormat: () => settingsRouteMocks.deleteDownloadFormat,
	useDeleteDownloadProfile: () => settingsRouteMocks.deleteDownloadProfile,
	useDeleteIndexer: () => settingsRouteMocks.deleteIndexer,
	useRegenerateApiKey: () => settingsRouteMocks.regenerateApiKey,
	useUpdateDownloadClient: () => settingsRouteMocks.updateDownloadClient,
	useUpdateDownloadFormat: () => settingsRouteMocks.updateDownloadFormat,
	useUpdateDownloadProfile: () => settingsRouteMocks.updateDownloadProfile,
	useUpdateIndexer: () => settingsRouteMocks.updateIndexer,
	useUpdateMetadataProfile: () => settingsRouteMocks.updateMetadataProfile,
	useUpdateSettings: () => settingsRouteMocks.updateSettings,
	useUpdateSyncedIndexer: () => settingsRouteMocks.updateSyncedIndexer,
}));

vi.mock("src/hooks/mutations/custom-formats", () => ({
	useBulkSetProfileCFScores: () => settingsRouteMocks.bulkSetProfileCFScores,
	useCreateCustomFormat: () => settingsRouteMocks.createCustomFormat,
	useDeleteCustomFormat: () => settingsRouteMocks.deleteCustomFormat,
	useDuplicateCustomFormat: () => settingsRouteMocks.duplicateCustomFormat,
	useUpdateCustomFormat: () => settingsRouteMocks.updateCustomFormat,
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

vi.mock("src/lib/nav-config", () => ({
	settingsNavItems: settingsRouteMocks.settingsNavItems,
}));

vi.mock("src/lib/form-validation", () => ({
	default: (schema: unknown, data: unknown) =>
		settingsRouteMocks.validateForm(schema, data),
}));

vi.mock("src/lib/validators", () => ({
	metadataProfileSchema: {},
}));

vi.mock("src/lib/queries", () => ({
	downloadClientsListQuery: settingsRouteMocks.downloadClientsListQuery,
	downloadFormatsListQuery: settingsRouteMocks.downloadFormatsListQuery,
	downloadProfilesListQuery: settingsRouteMocks.downloadProfilesListQuery,
	indexerStatusesQuery: settingsRouteMocks.indexerStatusesQuery,
	indexersListQuery: settingsRouteMocks.indexersListQuery,
	metadataProfileQuery: settingsRouteMocks.metadataProfileQuery,
	settingsMapQuery: settingsRouteMocks.settingsMapQuery,
	syncedIndexersListQuery: settingsRouteMocks.syncedIndexersListQuery,
}));

vi.mock("src/lib/queries/custom-formats", () => ({
	customFormatsListQuery: settingsRouteMocks.customFormatsListQuery,
}));

vi.mock("src/server/custom-format-import-export", () => ({
	exportCustomFormatsFn: (...args: unknown[]) =>
		settingsRouteMocks.exportCustomFormatsFn(...(args as [])),
	importCustomFormatsFn: (...args: unknown[]) =>
		settingsRouteMocks.importCustomFormatsFn(...(args as [])),
}));

vi.mock("src/server/filesystem", () => ({
	getServerCwdFn: (...args: unknown[]) =>
		settingsRouteMocks.getServerCwdFn(...(args as [])),
}));

vi.mock("src/server/import-list-exclusions", () => ({
	getBookImportExclusionsFn: (...args: unknown[]) =>
		settingsRouteMocks.getBookImportExclusionsFn(...(args as [])),
	getMovieImportExclusionsFn: (...args: unknown[]) =>
		settingsRouteMocks.getMovieImportExclusionsFn(...(args as [])),
	removeBookImportExclusionFn: (...args: unknown[]) =>
		settingsRouteMocks.removeBookImportExclusionFn(...(args as [])),
	removeMovieImportExclusionFn: (...args: unknown[]) =>
		settingsRouteMocks.removeMovieImportExclusionFn(...(args as [])),
}));

vi.mock("src/server/settings", () => ({
	updateSettingFn: (...args: unknown[]) =>
		settingsRouteMocks.updateSettingFn(...(args as [])),
}));

import { Route as CustomFormatsRoute } from "./custom-formats";
import { Route as DownloadClientsRoute } from "./download-clients";
import { Route as FormatsRoute } from "./formats";
import { Route as GeneralRoute } from "./general";
import { Route as ImportListsRoute } from "./import-lists";
import { Route as SettingsIndexRoute } from "./index";
import { Route as IndexersRoute } from "./indexers";
import { Route as MetadataRoute } from "./metadata";
import { Route as ProfilesRoute } from "./profiles";

describe("settings routes", () => {
	const renderRouteComponent = (Component: () => JSX.Element) =>
		renderWithProviders(<Component />);

	beforeEach(() => {
		vi.clearAllMocks();

		settingsRouteMocks.customFormatsListQuery.mockReturnValue({
			queryKey: ["custom-formats"],
		});
		settingsRouteMocks.downloadClientsListQuery.mockReturnValue({
			queryKey: ["download-clients"],
		});
		settingsRouteMocks.downloadFormatsListQuery.mockReturnValue({
			queryKey: ["download-formats"],
		});
		settingsRouteMocks.downloadProfilesListQuery.mockReturnValue({
			queryKey: ["download-profiles"],
		});
		settingsRouteMocks.indexerStatusesQuery.mockReturnValue({
			queryKey: ["indexer-statuses"],
		});
		settingsRouteMocks.indexersListQuery.mockReturnValue({
			queryKey: ["indexers"],
		});
		settingsRouteMocks.metadataProfileQuery.mockReturnValue({
			queryKey: ["metadata-profile"],
		});
		settingsRouteMocks.settingsMapQuery.mockReturnValue({
			queryKey: ["settings-map"],
		});
		settingsRouteMocks.syncedIndexersListQuery.mockReturnValue({
			queryKey: ["synced-indexers"],
		});

		settingsRouteMocks.regenerateApiKey.mutate.mockImplementation(
			(
				_: unknown,
				options?: { onSuccess?: (data: { apiKey: string }) => void },
			) => {
				options?.onSuccess?.({ apiKey: "new-api-key" });
			},
		);

		settingsRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey?: Array<string> }) => {
				switch (query.queryKey?.[0]) {
					case "custom-formats":
						return { data: [{ id: 1, name: "Preferred" }], status: "success" };
					case "download-clients":
						return {
							data: settingsRouteMocks.downloadClients,
							status: "success",
						};
					case "download-formats":
						return {
							data: settingsRouteMocks.downloadFormats,
							status: "success",
						};
					case "download-profiles":
						return {
							data: settingsRouteMocks.downloadProfiles,
							status: "success",
						};
					case "indexers":
						return { data: settingsRouteMocks.indexers, status: "success" };
					case "metadata-profile":
						return {
							data: settingsRouteMocks.metadataProfile,
							status: "success",
						};
					case "settings-map":
						return { data: settingsRouteMocks.settingsMap, status: "success" };
					default:
						return { data: [], status: "success" };
				}
			},
		);

		settingsRouteMocks.useQuery.mockImplementation(
			(query: { queryKey?: Array<string> }) => {
				switch (query.queryKey?.[0]) {
					case "download-formats":
						return {
							data: settingsRouteMocks.downloadFormats,
							status: "success",
						};
					case "settings-map":
						return { data: settingsRouteMocks.settingsMap, status: "success" };
					case "download-clients":
						return {
							data: settingsRouteMocks.downloadClients,
							status: "success",
						};
					case "synced-indexers":
						return {
							data: settingsRouteMocks.syncedIndexers,
							status: "success",
						};
					case "indexer-statuses":
						return {
							data: settingsRouteMocks.indexerStatuses,
							status: "success",
						};
					default:
						return { data: { items: [] }, status: "success" };
				}
			},
		);

		ProfilesRoute.useLoaderData = () =>
			settingsRouteMocks.downloadProfilesLoaderData as never;
	});

	it("renders the settings index shell and enforces admin access", async () => {
		const route = SettingsIndexRoute as unknown as {
			beforeLoad: (input: {
				context: { session: { user: { role?: string | null } } };
			}) => void;
			component: () => JSX.Element;
		};

		expect(() =>
			route.beforeLoad({
				context: { session: { user: { role: "member" } } },
			}),
		).toThrow("redirect:/");

		await renderRouteComponent(route.component);
		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Settings");
		await expect
			.element(page.getByRole("heading", { name: "General" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("heading", { name: "Formats" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("heading", { name: "Imports" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("heading", { name: "Download Clients" }))
			.toBeInTheDocument();
	});

	it("wires the general settings loader and key actions", async () => {
		const ensureQueryData = vi.fn();
		const route = GeneralRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
		};

		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(settingsRouteMocks.settingsMapQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["settings-map"] }),
		);

		await renderRouteComponent(route.component);

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("General Settings");
		await expect
			.element(
				page.elementLocator(
					document.querySelector('input[value="old-api-key"]') as HTMLElement,
				),
			)
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Save Settings" }).click();
		expect(settingsRouteMocks.updateSettings.mutate).toHaveBeenCalledWith([
			{ key: "general.logLevel", value: "warn" },
		]);

		await page.getByRole("button", { name: "Regenerate API Key" }).click();
		await page.getByRole("button", { name: "confirm" }).click();
		expect(settingsRouteMocks.regenerateApiKey.mutate).toHaveBeenCalledTimes(1);
		await expect
			.element(
				page.elementLocator(
					document.querySelector('input[value="new-api-key"]') as HTMLElement,
				),
			)
			.toBeInTheDocument();
	});

	it("wires the formats loader and default-setting edit flow", async () => {
		const ensureQueryData = vi.fn();
		const route = FormatsRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
		};

		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(settingsRouteMocks.downloadFormatsListQuery).toHaveBeenCalledTimes(
			1,
		);
		expect(settingsRouteMocks.settingsMapQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["download-formats"] }),
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["settings-map"] }),
		);

		await renderRouteComponent(route.component);

		await expect
			.element(page.getByTestId("download-format-list"))
			.toHaveTextContent("1");
		await expect
			.element(page.getByRole("button", { name: "Add Format" }))
			.toBeInTheDocument();

		const defaultMovieLocator = page.getByLabelText("Default Movie Runtime");
		await userEvent.clear(defaultMovieLocator);
		await userEvent.type(defaultMovieLocator, "155");
		await userEvent.tab();

		await expect
			.poll(() => settingsRouteMocks.updateSettingFn)
			.toHaveBeenCalledWith({
				data: { key: "format.movie.defaultRuntime", value: 155 },
			});

		await page.getByRole("button", { name: "Add Format" }).click();
		await expect
			.element(page.getByTestId("download-format-form"))
			.toBeInTheDocument();
	});

	it("wires the download clients loader and add-client dialog", async () => {
		const ensureQueryData = vi.fn();
		const route = DownloadClientsRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
		};

		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(settingsRouteMocks.downloadClientsListQuery).toHaveBeenCalledTimes(
			1,
		);
		expect(settingsRouteMocks.settingsMapQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["download-clients"] }),
		);

		await renderRouteComponent(route.component);

		await expect
			.element(page.getByTestId("download-client-list"))
			.toHaveTextContent("1");
		await expect
			.element(page.getByRole("button", { name: "Save Settings" }))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Save Settings" }).click();
		expect(settingsRouteMocks.updateSettings.mutate).toHaveBeenCalledWith([
			{
				key: "downloadClient.enableCompletedDownloadHandling",
				value: true,
			},
			{ key: "downloadClient.redownloadFailed", value: true },
			{ key: "downloadClient.removeFailed", value: true },
		]);

		await page.getByRole("button", { name: "Add Client" }).click();
		await expect
			.element(page.getByTestId("download-client-implementation-select"))
			.toBeInTheDocument();
	});

	it("renders import list placeholders for admins", async () => {
		const route = ImportListsRoute as unknown as {
			beforeLoad: (input: {
				context: { session: { user: { role?: string | null } } };
			}) => void;
			component: () => JSX.Element;
		};

		expect(() =>
			route.beforeLoad({
				context: { session: { user: { role: "member" } } },
			}),
		).toThrow("redirect:/");

		await renderRouteComponent(route.component);

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Import Lists");
		const emptyStates = page.getByTestId("empty-state");
		await expect.element(emptyStates.first()).toBeInTheDocument();
		const emptyDescriptions = page.getByTestId("empty-state-description");
		await expect
			.element(emptyDescriptions.first())
			.toHaveTextContent("Books excluded from import lists will appear here.");
	});

	it("wires the indexers loader and add-indexer dialog", async () => {
		const ensureQueryData = vi.fn();
		const route = IndexersRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
		};

		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(settingsRouteMocks.indexersListQuery).toHaveBeenCalledTimes(1);
		expect(settingsRouteMocks.downloadClientsListQuery).toHaveBeenCalledTimes(
			1,
		);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["indexers"] }),
		);

		await renderRouteComponent(route.component);

		await expect
			.element(page.getByTestId("indexer-list"))
			.toHaveTextContent("1");
		await page.getByRole("button", { name: "Add Indexer" }).click();
		await expect
			.element(page.getByTestId("indexer-implementation-select"))
			.toBeInTheDocument();
	});

	it("wires the metadata loader and TMDB save action", async () => {
		const ensureQueryData = vi.fn();
		const route = MetadataRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
		};

		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(settingsRouteMocks.metadataProfileQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["metadata-profile"] }),
		);

		const routeWithLoader = MetadataRoute as unknown as {
			component: () => JSX.Element;
			useLoaderData: () => unknown;
		};
		routeWithLoader.useLoaderData = () => undefined;

		await renderRouteComponent(routeWithLoader.component);

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Metadata Settings");
		await page.getByRole("button", { name: "Save TMDB Settings" }).click();
		expect(settingsRouteMocks.updateSettings.mutate).toHaveBeenCalledWith([
			{ key: "metadata.tmdb.language", value: "en" },
			{ key: "metadata.tmdb.includeAdult", value: false },
			{ key: "metadata.tmdb.region", value: "" },
		]);
	});

	it("returns the server cwd for profiles and opens the add dialog", async () => {
		const ensureQueryData = vi.fn();
		const route = ProfilesRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<{ serverCwd: string }>;
		};

		await expect(
			route.loader({
				context: { queryClient: { ensureQueryData } },
			}),
		).resolves.toEqual({ serverCwd: "/srv" });

		expect(settingsRouteMocks.downloadProfilesListQuery).toHaveBeenCalledTimes(
			1,
		);
		expect(settingsRouteMocks.getServerCwdFn).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["download-profiles"] }),
		);

		await renderRouteComponent(route.component);

		await expect
			.element(page.getByTestId("download-profile-list"))
			.toHaveTextContent("1");
		await page.getByRole("button", { name: "Add Profile" }).click();
		await expect
			.element(page.getByTestId("download-profile-form"))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("download-profile-form-server-cwd"))
			.toHaveTextContent("/srv");
	});

	it("wires the custom formats loader and add-format sheet", async () => {
		const ensureQueryData = vi.fn();
		const route = CustomFormatsRoute as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
		};

		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(settingsRouteMocks.customFormatsListQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["custom-formats"] }),
		);

		await renderRouteComponent(route.component);

		await expect
			.element(page.getByTestId("custom-format-list"))
			.toHaveTextContent("1");
		await page.getByRole("button", { name: "Add Custom Format" }).click();
		await expect
			.element(page.getByTestId("custom-format-form"))
			.toBeInTheDocument();
	});
});
