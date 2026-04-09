import { fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorDetailRouteMocks = vi.hoisted(() => ({
	author: null as null | Record<string, unknown>,
	authorBooksInfiniteQuery: vi.fn(
		(
			authorId: number,
			searchQuery = "",
			language = "en",
			sortKey = "readers",
			sortDir = "desc",
		) => ({
			queryKey: [
				"author-books",
				authorId,
				searchQuery,
				language,
				sortKey,
				sortDir,
			],
		}),
	),
	authorDetailQuery: vi.fn((id: number) => ({
		queryKey: ["author-detail", id],
	})),
	bulkMonitorBook: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	bulkUnmonitorBook: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	deleteAuthor: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	downloadProfiles: [] as Array<Record<string, unknown>>,
	downloadProfilesListQuery: vi.fn(() => ({
		queryKey: ["download-profiles", "list"],
	})),
	invalidate: vi.fn(),
	metadataProfile: null as null | Record<string, unknown>,
	metadataProfileQuery: vi.fn(() => ({
		queryKey: ["metadata-profile"],
	})),
	monitorBookProfile: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	navigate: vi.fn(),
	notFound: vi.fn(() => new Error("not-found")),
	params: {
		authorId: "7",
	},
	refreshAuthorMetadata: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	setObserverCallback: undefined as
		| ((entries: IntersectionObserverEntry[]) => void)
		| undefined,
	updateAuthor: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	unmonitorBookProfile: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	useInfiniteQuery: vi.fn(),
	useQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
	useTableColumns: vi.fn((_tableId?: string) => ({
		visibleColumns: [{ key: "title" }, { key: "readers" }, { key: "rating" }],
	})),
	userSettingsQuery: vi.fn((tableId: string) => ({
		queryKey: ["user-settings", tableId],
	})),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useInfiniteQuery: (...args: Parameters<typeof actual.useInfiniteQuery>) =>
			authorDetailRouteMocks.useInfiniteQuery(...args),
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			authorDetailRouteMocks.useQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			authorDetailRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
	createFileRoute: () => (config: unknown) => ({
		...(config as Record<string, unknown>),
		useParams: () => authorDetailRouteMocks.params,
	}),
	notFound: () => authorDetailRouteMocks.notFound(),
	useNavigate: () => authorDetailRouteMocks.navigate,
	useRouter: () => ({
		invalidate: authorDetailRouteMocks.invalidate,
	}),
}));

vi.mock("lucide-react", () => ({
	ArrowLeft: ({ className }: { className?: string }) => (
		<span className={className}>ArrowLeft</span>
	),
	BookMarked: ({ className }: { className?: string }) => (
		<span className={className}>BookMarked</span>
	),
	BookOpen: ({ className }: { className?: string }) => (
		<span className={className}>BookOpen</span>
	),
	BookText: ({ className }: { className?: string }) => (
		<span className={className}>BookText</span>
	),
	AudioLines: ({ className }: { className?: string }) => (
		<span className={className}>AudioLines</span>
	),
	ChevronRight: ({ className }: { className?: string }) => (
		<span className={className}>ChevronRight</span>
	),
	Clapperboard: ({ className }: { className?: string }) => (
		<span className={className}>Clapperboard</span>
	),
	Disc: ({ className }: { className?: string }) => (
		<span className={className}>Disc</span>
	),
	FileText: ({ className }: { className?: string }) => (
		<span className={className}>FileText</span>
	),
	FileType: ({ className }: { className?: string }) => (
		<span className={className}>FileType</span>
	),
	Film: ({ className }: { className?: string }) => (
		<span className={className}>Film</span>
	),
	Hd: ({ className }: { className?: string }) => (
		<span className={className}>Hd</span>
	),
	Headphones: ({ className }: { className?: string }) => (
		<span className={className}>Headphones</span>
	),
	Library: ({ className }: { className?: string }) => (
		<span className={className}>Library</span>
	),
	Loader2: ({ className }: { className?: string }) => (
		<span className={className}>Loader2</span>
	),
	Plus: ({ className }: { className?: string }) => (
		<span className={className}>Plus</span>
	),
	Mic: ({ className }: { className?: string }) => (
		<span className={className}>Mic</span>
	),
	MonitorPlay: ({ className }: { className?: string }) => (
		<span className={className}>MonitorPlay</span>
	),
	Music: ({ className }: { className?: string }) => (
		<span className={className}>Music</span>
	),
	Search: ({ className }: { className?: string }) => (
		<span className={className}>Search</span>
	),
	NotebookPen: ({ className }: { className?: string }) => (
		<span className={className}>NotebookPen</span>
	),
	Settings2: ({ className }: { className?: string }) => (
		<span className={className}>Settings2</span>
	),
	Star: ({ className }: { className?: string }) => (
		<span className={className}>Star</span>
	),
	ScrollText: ({ className }: { className?: string }) => (
		<span className={className}>ScrollText</span>
	),
	Tv: ({ className }: { className?: string }) => (
		<span className={className}>Tv</span>
	),
	Video: ({ className }: { className?: string }) => (
		<span className={className}>Video</span>
	),
	X: ({ className }: { className?: string }) => (
		<span className={className}>X</span>
	),
}));

vi.mock("src/components/NotFound", () => ({
	default: () => <div data-testid="not-found">Missing author</div>,
}));

vi.mock("src/components/bookshelf/authors/author-form", () => ({
	default: () => <div data-testid="author-form" />,
}));

vi.mock("src/components/bookshelf/books/additional-authors", () => ({
	default: ({
		bookAuthors,
	}: {
		bookAuthors: Array<{ authorName: string }>;
	}) => (
		<span>{bookAuthors.map((author) => author.authorName).join(", ")}</span>
	),
}));

vi.mock("src/components/bookshelf/hardcover/book-preview-modal", () => ({
	default: () => <div data-testid="book-preview-modal" />,
}));

vi.mock("src/components/bookshelf/books/base-book-table", () => ({
	default: ({
		children,
		onRowClick,
		onSort,
		rows,
		renderLeadingCell,
		emptyMessage,
	}: {
		children?: ReactNode;
		emptyMessage: string;
		onRowClick: (row: { bookId: number; title: string }) => void;
		onSort: (key: string) => void;
		renderLeadingCell: (row: {
			bookId: number;
			downloadProfileIds: Array<number>;
			title: string;
		}) => ReactNode;
		rows: Array<{
			bookId: number;
			downloadProfileIds: Array<number>;
			title: string;
		}>;
	}) => (
		<div data-testid="base-book-table">
			<span data-testid="base-book-table-empty">{emptyMessage}</span>
			<span data-testid="base-book-table-items">
				{rows.map((row) => row.title).join(",")}
			</span>
			<button type="button" onClick={() => onSort("title")}>
				sort-title
			</button>
			{rows.map((row) => (
				<div key={row.bookId}>
					{renderLeadingCell(row)}
					<button type="button" onClick={() => onRowClick(row)}>
						{row.title}
					</button>
				</div>
			))}
			{children}
		</div>
	),
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		loading,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		loading?: boolean;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<span>{title}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					cancel
				</button>
				<button type="button" onClick={onConfirm} disabled={loading}>
					confirm
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/bookshelf/books/unmonitor-dialog", () => ({
	default: ({ open, profileName }: { open: boolean; profileName: string }) =>
		open ? (
			<div data-testid="unmonitor-dialog">
				<span>{profileName}</span>
			</div>
		) : null,
}));

vi.mock("src/components/shared/action-button-group", () => ({
	default: ({
		externalLabel,
		isRefreshing,
		onDelete,
		onEdit,
		onRefreshMetadata,
	}: {
		externalLabel?: string;
		isRefreshing: boolean;
		onDelete: () => void;
		onEdit: () => void;
		onRefreshMetadata: () => void;
	}) => (
		<div data-testid="action-button-group">
			<span>{externalLabel}</span>
			<button type="button" onClick={onRefreshMetadata} disabled={isRefreshing}>
				refresh
			</button>
			<button type="button" onClick={onEdit}>
				edit
			</button>
			<button type="button" onClick={onDelete}>
				delete
			</button>
		</div>
	),
}));

vi.mock("src/components/shared/column-settings-popover", () => ({
	default: ({ tableId }: { tableId: string }) => (
		<div data-testid="column-settings-popover">{tableId}</div>
	),
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	BookTableRowsSkeleton: ({ columns }: { columns: number }) => (
		<div data-testid="book-table-rows-skeleton">{columns}</div>
	),
}));

vi.mock("src/components/shared/metadata-warning", () => ({
	default: ({ itemTitle, type }: { itemTitle: string; type: string }) => (
		<div data-testid="metadata-warning">
			{type}:{itemTitle}
		</div>
	),
}));

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: ReactNode;
		title: string;
	}) => (
		<div data-testid="page-header">
			<span data-testid="page-header-title">{title}</span>
			{description ? (
				<span data-testid="page-header-description">{description}</span>
			) : null}
		</div>
	),
}));

vi.mock("src/components/shared/profile-toggle-icons", () => ({
	default: ({
		activeProfileIds,
		onToggle,
		partialProfileIds,
		profiles,
	}: {
		activeProfileIds: Array<number>;
		onToggle: (profileId: number) => void;
		partialProfileIds?: Array<number>;
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div data-testid="profile-toggle-icons">
			<span data-testid="profile-toggle-icons-active">
				{activeProfileIds.join(",")}
			</span>
			<span data-testid="profile-toggle-icons-partial">
				{partialProfileIds?.join(",") ?? ""}
			</span>
			{profiles.map((profile) => (
				<button
					key={profile.id}
					type="button"
					onClick={() => onToggle(profile.id)}
				>
					toggle-{profile.name}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/shared/edit-series-profiles-dialog", () => ({
	default: ({
		loading,
		onCancel,
		onSubmit,
	}: {
		loading?: boolean;
		onCancel: () => void;
		onSubmit: (values: {
			downloadProfileIds: number[];
			monitorNewBooks: "all" | "none" | "new";
		}) => void;
	}) => (
		<div data-testid="edit-series-profiles-dialog">
			<button
				type="button"
				disabled={loading}
				onClick={() =>
					onSubmit({
						downloadProfileIds: [11],
						monitorNewBooks: "new",
					})
				}
			>
				save
			</button>
			<button type="button" onClick={onCancel}>
				cancel
			</button>
		</div>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		type,
	}: {
		children: ReactNode;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button onClick={onClick} type={type ?? "button"}>
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
	CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		onChange,
		placeholder,
		value,
	}: {
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => (
		<input
			aria-label="Search books"
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	),
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<div data-value={value}>{children}</div>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => (
		<button type="button">{children}</button>
	),
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<span>{placeholder}</span>
	),
}));

vi.mock("src/components/ui/tabs", async () => {
	const React = await import("react");
	const TabsContext = React.createContext<{
		onValueChange?: (value: string) => void;
		value: string;
	}>({ value: "books" });

	return {
		Tabs: ({
			children,
			onValueChange,
			value,
		}: {
			children: ReactNode;
			onValueChange?: (value: string) => void;
			value: string;
		}) => (
			<TabsContext.Provider value={{ onValueChange, value }}>
				<div>{children}</div>
			</TabsContext.Provider>
		),
		TabsContent: ({
			children,
			value,
		}: {
			children: ReactNode;
			value: string;
		}) => {
			const context = React.useContext(TabsContext);
			return context.value === value ? <div>{children}</div> : null;
		},
		TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		TabsTrigger: ({
			children,
			value,
		}: {
			children: ReactNode;
			value: string;
		}) => {
			const context = React.useContext(TabsContext);
			return (
				<button type="button" onClick={() => context.onValueChange?.(value)}>
					{children}
				</button>
			);
		},
	};
});

vi.mock("src/hooks/mutations", () => ({
	useBulkMonitorBookProfile: () => authorDetailRouteMocks.bulkMonitorBook,
	useBulkUnmonitorBookProfile: () => authorDetailRouteMocks.bulkUnmonitorBook,
	useDeleteAuthor: () => authorDetailRouteMocks.deleteAuthor,
	useMonitorBookProfile: () => authorDetailRouteMocks.monitorBookProfile,
	useRefreshAuthorMetadata: () => authorDetailRouteMocks.refreshAuthorMetadata,
	useUnmonitorBookProfile: () => authorDetailRouteMocks.unmonitorBookProfile,
	useUpdateAuthor: () => authorDetailRouteMocks.updateAuthor,
}));

vi.mock("src/hooks/mutations/series", () => ({
	useRefreshSeries: () => ({
		isPending: false,
		mutate: vi.fn(),
	}),
	useUpdateSeries: () => ({
		isPending: false,
		mutate: vi.fn(),
	}),
}));

vi.mock("src/hooks/use-table-columns", () => ({
	useTableColumns: (tableId: string) =>
		authorDetailRouteMocks.useTableColumns(tableId),
}));

vi.mock("src/lib/queries", () => ({
	authorBooksInfiniteQuery: (
		authorId: number,
		searchQuery?: string,
		language?: string,
		sortKey?: string,
		sortDir?: "asc" | "desc",
	) =>
		authorDetailRouteMocks.authorBooksInfiniteQuery(
			authorId,
			searchQuery,
			language,
			sortKey,
			sortDir,
		),
	authorDetailQuery: (id: number) =>
		authorDetailRouteMocks.authorDetailQuery(id),
	downloadProfilesListQuery: () =>
		authorDetailRouteMocks.downloadProfilesListQuery(),
	metadataProfileQuery: () => authorDetailRouteMocks.metadataProfileQuery(),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) =>
		authorDetailRouteMocks.userSettingsQuery(tableId),
}));

import { Route } from "./$authorId";

describe("AuthorDetailRoute", () => {
	beforeEach(() => {
		authorDetailRouteMocks.author = null;
		authorDetailRouteMocks.downloadProfiles = [];
		authorDetailRouteMocks.metadataProfile = null;
		authorDetailRouteMocks.authorBooksInfiniteQuery.mockClear();
		authorDetailRouteMocks.authorDetailQuery.mockClear();
		authorDetailRouteMocks.bulkMonitorBook.mutate.mockReset();
		authorDetailRouteMocks.bulkUnmonitorBook.mutate.mockReset();
		authorDetailRouteMocks.deleteAuthor.mutate.mockReset();
		authorDetailRouteMocks.downloadProfilesListQuery.mockClear();
		authorDetailRouteMocks.invalidate.mockReset();
		authorDetailRouteMocks.metadataProfileQuery.mockClear();
		authorDetailRouteMocks.monitorBookProfile.mutate.mockReset();
		authorDetailRouteMocks.navigate.mockReset();
		authorDetailRouteMocks.notFound.mockClear();
		authorDetailRouteMocks.params.authorId = "7";
		authorDetailRouteMocks.refreshAuthorMetadata.mutate.mockReset();
		authorDetailRouteMocks.updateAuthor.mutate.mockReset();
		authorDetailRouteMocks.unmonitorBookProfile.mutate.mockReset();
		authorDetailRouteMocks.useInfiniteQuery.mockReset();
		authorDetailRouteMocks.useInfiniteQuery.mockImplementation(
			() =>
				({
					data: {
						pages: [
							{
								items:
									(
										authorDetailRouteMocks.author as {
											books: Array<Record<string, unknown>>;
										} | null
									)?.books ?? [],
								total:
									(
										authorDetailRouteMocks.author as {
											books: Array<Record<string, unknown>>;
										} | null
									)?.books?.length ?? 0,
							},
						],
					},
					fetchNextPage: vi.fn(),
					hasNextPage: false,
					isFetchingNextPage: false,
					isLoading: false,
				}) as never,
		);
		authorDetailRouteMocks.useQuery.mockReset();
		authorDetailRouteMocks.useQuery.mockReturnValue({ data: false });
		authorDetailRouteMocks.useSuspenseQuery.mockReset();
		authorDetailRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: [string, ...unknown[]] }) => {
				if (query.queryKey[0] === "author-detail") {
					return { data: authorDetailRouteMocks.author };
				}
				if (query.queryKey[0] === "download-profiles") {
					return { data: authorDetailRouteMocks.downloadProfiles };
				}
				if (query.queryKey[0] === "metadata-profile") {
					return { data: authorDetailRouteMocks.metadataProfile };
				}
				return { data: undefined };
			},
		);

		class MockIntersectionObserver implements IntersectionObserver {
			root = null;
			rootMargin = "200px";
			scrollMargin = "0px";
			thresholds = [];

			constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
				authorDetailRouteMocks.setObserverCallback = callback;
			}

			disconnect = vi.fn();
			observe = vi.fn();
			takeRecords = () => [];
			unobserve = vi.fn();
		}

		globalThis.IntersectionObserver =
			MockIntersectionObserver as unknown as typeof IntersectionObserver;
	});

	it("rejects invalid ids and converts missing-author loader errors into notFound", async () => {
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: (query: unknown) => Promise<unknown>;
					};
				};
				params: { authorId: string };
			}) => Promise<unknown>;
		};

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: vi.fn(),
					},
				},
				params: { authorId: "0" },
			}),
		).rejects.toThrow("not-found");

		const ensureQueryData = vi
			.fn()
			.mockRejectedValueOnce(new Error("author not found"))
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData,
					},
				},
				params: { authorId: "7" },
			}),
		).rejects.toThrow("not-found");

		expect(authorDetailRouteMocks.authorDetailQuery).toHaveBeenCalledWith(7);
		expect(
			authorDetailRouteMocks.downloadProfilesListQuery,
		).toHaveBeenCalledTimes(1);
		expect(authorDetailRouteMocks.metadataProfileQuery).toHaveBeenCalledTimes(
			1,
		);
		expect(authorDetailRouteMocks.userSettingsQuery).toHaveBeenNthCalledWith(
			1,
			"author-books",
		);
		expect(authorDetailRouteMocks.userSettingsQuery).toHaveBeenNthCalledWith(
			2,
			"author-series",
		);

		const nullAuthorEnsureQueryData = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: nullAuthorEnsureQueryData,
					},
				},
				params: { authorId: "7" },
			}),
		).rejects.toThrow("not-found");

		const upstreamError = new Error("boom");
		const unexpectedEnsureQueryData = vi
			.fn()
			.mockRejectedValueOnce(upstreamError)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: unexpectedEnsureQueryData,
					},
				},
				params: { authorId: "7" },
			}),
		).rejects.toBe(upstreamError);
	});

	it("renders the books tab and wires row navigation, sorting, and profile monitoring", () => {
		authorDetailRouteMocks.author = {
			availableLanguages: [
				{ language: "English", languageCode: "en" },
				{ language: "French", languageCode: "fr" },
			],
			bio: "Prolific science fiction author.",
			bornYear: 1920,
			books: [
				{
					asin: null,
					authorName: "Isaac Asimov",
					bookAuthors: [
						{
							authorId: 7,
							authorName: "Isaac Asimov",
							foreignAuthorId: "isaac-asimov",
							isPrimary: true,
						},
					],
					bookId: 1,
					coverUrl: null,
					downloadProfileIds: [],
					editionInformation: null,
					fileCount: 1,
					format: "ebook",
					id: 1,
					isbn10: null,
					isbn13: null,
					language: "English",
					metadataSourceMissingSince: null,
					missingEditionsCount: 0,
					pageCount: 800,
					publisher: "Ace",
					rating: 4.2,
					ratingsCount: 123,
					releaseDate: "1950-01-01",
					releaseYear: 1950,
					score: 98,
					series: null,
					title: "Foundation",
					usersCount: 10_000,
					country: "US",
					audioLength: null,
				},
				{
					asin: null,
					authorName: "Isaac Asimov",
					bookAuthors: [
						{
							authorId: 7,
							authorName: "Isaac Asimov",
							foreignAuthorId: "isaac-asimov",
							isPrimary: true,
						},
					],
					bookId: 2,
					coverUrl: null,
					downloadProfileIds: [11],
					editionInformation: null,
					fileCount: 1,
					format: "ebook",
					id: 2,
					isbn10: null,
					isbn13: null,
					language: "French",
					metadataSourceMissingSince: null,
					missingEditionsCount: 0,
					pageCount: 256,
					publisher: "Gnome Press",
					rating: 4,
					ratingsCount: 80,
					releaseDate: "1951-01-01",
					releaseYear: 1951,
					score: 95,
					series: null,
					title: "I, Robot",
					usersCount: 8_000,
					country: "US",
					audioLength: null,
				},
			],
			bookCount: 2,
			downloadProfileIds: [11],
			foreignAuthorId: "isaac-asimov",
			id: 7,
			images: [{ url: "/authors/asimov.jpg", coverType: "cover" }],
			name: "Isaac Asimov",
			deathYear: 1992,
			status: "active",
			series: [],
		};
		authorDetailRouteMocks.downloadProfiles = [
			{
				contentType: "ebook",
				id: 11,
				language: "en",
				name: "4K",
			},
			{
				contentType: "audiobook",
				id: 12,
				language: "fr",
				name: "Audio",
			},
		];
		authorDetailRouteMocks.metadataProfile = {
			skipMissingIsbnAsin: false,
			skipMissingReleaseDate: false,
		};

		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};

		const { getAllByRole, getAllByTestId, getByRole, getByTestId } =
			renderWithProviders(<routeConfig.component />);

		expect(getByTestId("page-header-title")).toHaveTextContent("Isaac Asimov");
		expect(getByTestId("page-header-description")).toHaveTextContent(
			"1920-1992",
		);
		expect(getByTestId("column-settings-popover")).toHaveTextContent(
			"author-books",
		);
		expect(getByTestId("base-book-table-items")).toBeInTheDocument();
		expect(getAllByTestId("profile-toggle-icons")[0]).toHaveTextContent("4K");
		expect(getAllByTestId("profile-toggle-icons-partial")[0]).toHaveTextContent(
			"11",
		);

		fireEvent.click(getByRole("button", { name: "sort-title" }));
		expect(
			authorDetailRouteMocks.authorBooksInfiniteQuery,
		).toHaveBeenLastCalledWith(7, "", "en", "title", "asc");

		fireEvent.click(getByRole("button", { name: "Foundation" }));
		expect(authorDetailRouteMocks.navigate).toHaveBeenCalledWith({
			params: { bookId: "1" },
			to: "/books/$bookId",
		});

		fireEvent.click(getAllByRole("button", { name: "toggle-4K" })[0]);
		expect(authorDetailRouteMocks.bulkMonitorBook.mutate).toHaveBeenCalledWith(
			{
				bookIds: [1, 2],
				downloadProfileId: 11,
			},
			expect.any(Object),
		);
	});
});
