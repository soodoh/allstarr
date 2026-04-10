import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const bookDetailRouteMocks = vi.hoisted(() => ({
	book: null as null | Record<string, unknown>,
	bookDetailQuery: vi.fn((id: number) => ({
		queryKey: ["book-detail", id],
	})),
	downloadProfiles: [] as Array<Record<string, unknown>>,
	downloadProfilesListQuery: vi.fn(() => ({
		queryKey: ["download-profiles", "list"],
	})),
	hasEnabledIndexersQuery: vi.fn(() => ({
		queryKey: ["indexers", "enabled"],
	})),
	monitorBookProfile: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	invalidate: vi.fn(),
	navigate: vi.fn(),
	notFound: vi.fn(() => new Error("not-found")),
	params: {
		bookId: "9",
	},
	refreshBookMetadata: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	reassignBookFiles: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
	useQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
	userSettingsQuery: vi.fn((tableId: string) => ({
		queryKey: ["user-settings", tableId],
	})),
	unmonitorBookProfile: {
		isPending: false,
		mutate: vi.fn((_: unknown, options?: { onSuccess?: () => void }) =>
			options?.onSuccess?.(),
		),
	},
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			bookDetailRouteMocks.useQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			bookDetailRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
	createFileRoute: () => (config: unknown) => ({
		...(config as Record<string, unknown>),
		useParams: () => bookDetailRouteMocks.params,
	}),
	notFound: () => bookDetailRouteMocks.notFound(),
	useNavigate: () => bookDetailRouteMocks.navigate,
	useRouter: () => ({
		invalidate: bookDetailRouteMocks.invalidate,
	}),
}));

vi.mock("lucide-react", () => ({
	ArrowLeft: ({ className }: { className?: string }) => (
		<span className={className}>ArrowLeft</span>
	),
	ChevronDown: ({ className }: { className?: string }) => (
		<span className={className}>ChevronDown</span>
	),
}));

vi.mock("src/components/NotFound", () => ({
	default: () => <div data-testid="not-found">Missing book</div>,
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

vi.mock("src/components/bookshelf/books/book-delete-dialog", () => ({
	default: ({
		bookTitle,
		onOpenChange,
		onSuccess,
		open,
	}: {
		bookTitle: string;
		onOpenChange: (open: boolean) => void;
		onSuccess: () => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="book-delete-dialog">
				<span>{bookTitle}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					cancel
				</button>
				<button
					type="button"
					onClick={() => {
						onOpenChange(false);
						onSuccess();
					}}
				>
					confirm
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/bookshelf/books/book-edit-dialog", () => ({
	default: ({
		bookTitle,
		onOpenChange,
		onSuccess,
		open,
	}: {
		bookTitle: string;
		onOpenChange: (open: boolean) => void;
		onSuccess: () => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="book-edit-dialog">
				<span>{bookTitle}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					cancel
				</button>
				<button
					type="button"
					onClick={() => {
						onOpenChange(false);
						onSuccess();
					}}
				>
					save
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/bookshelf/books/book-files-tab", () => ({
	default: ({ files }: { files: Array<{ path?: string }> }) => (
		<div data-testid="book-files-tab">
			{files.map((file) => file.path).join(",")}
		</div>
	),
}));

vi.mock("src/components/bookshelf/books/book-history-tab", () => ({
	default: ({ bookId }: { bookId: number }) => (
		<div data-testid="book-history-tab">history:{bookId}</div>
	),
}));

vi.mock("src/components/bookshelf/books/editions-tab", () => ({
	default: ({ bookId, bookTitle }: { bookId: number; bookTitle: string }) => (
		<div data-testid="editions-tab">
			editions:{bookId}:{bookTitle}
		</div>
	),
}));

vi.mock("src/components/bookshelf/books/reassign-files-dialog", () => ({
	default: ({
		fromBookTitle,
		onOpenChange,
		onSuccess,
		open,
	}: {
		fromBookTitle: string;
		onOpenChange: (open: boolean) => void;
		onSuccess?: () => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="reassign-files-dialog">
				<span>{fromBookTitle}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					cancel
				</button>
				<button
					type="button"
					onClick={() => {
						onOpenChange(false);
						onSuccess?.();
					}}
				>
					reassign
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/bookshelf/books/search-releases-tab", () => ({
	default: ({
		enabled,
		hasIndexers,
	}: {
		enabled: boolean;
		hasIndexers: boolean | undefined;
	}) => (
		<div
			data-enabled={String(enabled)}
			data-has-indexers={String(hasIndexers)}
			data-testid="search-releases-tab"
		/>
	),
}));

vi.mock("src/components/bookshelf/books/unmonitor-dialog", () => ({
	default: ({
		open,
		onConfirm,
		onOpenChange,
		profileName,
	}: {
		onConfirm: (deleteFiles: boolean) => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		profileName: string;
	}) =>
		open ? (
			<div data-testid="unmonitor-dialog">
				<span>{profileName}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					cancel
				</button>
				<button type="button" onClick={() => onConfirm(true)}>
					confirm
				</button>
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

vi.mock("src/components/shared/metadata-warning", () => ({
	default: ({
		itemTitle,
		onDeleted,
		onReassignFiles,
		type,
	}: {
		itemTitle: string;
		onDeleted?: () => void;
		onReassignFiles?: () => void;
		type: string;
	}) => (
		<div data-testid="metadata-warning">
			{type}:{itemTitle}
			{onDeleted ? (
				<button type="button" onClick={onDeleted}>
					delete
				</button>
			) : null}
			{onReassignFiles ? (
				<button type="button" onClick={onReassignFiles}>
					reassign
				</button>
			) : null}
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
		profiles,
	}: {
		activeProfileIds: Array<number>;
		onToggle: (profileId: number) => void;
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div data-testid="profile-toggle-icons">
			<span data-testid="profile-toggle-icons-active">
				{activeProfileIds.join(",")}
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

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/popover", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: { children: ReactNode }) => (
		<button type="button">{children}</button>
	),
}));

vi.mock("src/components/ui/tabs", async () => {
	const React = await import("react");
	const TabsContext = React.createContext<{
		onValueChange?: (value: string) => void;
		value: string;
	}>({ value: "editions" });

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
	useMonitorBookProfile: () => bookDetailRouteMocks.monitorBookProfile,
	useRefreshBookMetadata: () => bookDetailRouteMocks.refreshBookMetadata,
	useUnmonitorBookProfile: () => bookDetailRouteMocks.unmonitorBookProfile,
}));

vi.mock("src/lib/queries", () => ({
	bookDetailQuery: (id: number) => bookDetailRouteMocks.bookDetailQuery(id),
	downloadProfilesListQuery: () =>
		bookDetailRouteMocks.downloadProfilesListQuery(),
	hasEnabledIndexersQuery: () => bookDetailRouteMocks.hasEnabledIndexersQuery(),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) =>
		bookDetailRouteMocks.userSettingsQuery(tableId),
}));

import { Route } from "./$bookId";

describe("BookDetailRoute", () => {
	beforeEach(() => {
		bookDetailRouteMocks.book = null;
		bookDetailRouteMocks.downloadProfiles = [];
		bookDetailRouteMocks.bookDetailQuery.mockClear();
		bookDetailRouteMocks.downloadProfilesListQuery.mockClear();
		bookDetailRouteMocks.hasEnabledIndexersQuery.mockClear();
		bookDetailRouteMocks.invalidate.mockReset();
		bookDetailRouteMocks.navigate.mockReset();
		bookDetailRouteMocks.notFound.mockClear();
		bookDetailRouteMocks.params.bookId = "9";
		bookDetailRouteMocks.useQuery.mockReset();
		bookDetailRouteMocks.useQuery.mockReturnValue({ data: false });
		bookDetailRouteMocks.useSuspenseQuery.mockReset();
		bookDetailRouteMocks.useSuspenseQuery.mockImplementation(
			(query: { queryKey: [string, ...unknown[]] }) => {
				if (query.queryKey[0] === "book-detail") {
					return { data: bookDetailRouteMocks.book };
				}
				if (query.queryKey[0] === "download-profiles") {
					return { data: bookDetailRouteMocks.downloadProfiles };
				}
				return { data: undefined };
			},
		);
	});

	it("rejects invalid ids and converts missing-book loader errors into notFound", async () => {
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: (query: unknown) => Promise<unknown>;
					};
				};
				params: { bookId: string };
			}) => Promise<unknown>;
		};

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: vi.fn(),
					},
				},
				params: { bookId: "0" },
			}),
		).rejects.toThrow("not-found");

		const ensureQueryData = vi
			.fn()
			.mockRejectedValueOnce(new Error("book not found"))
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce({});

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData,
					},
				},
				params: { bookId: "9" },
			}),
		).rejects.toThrow("not-found");

		expect(bookDetailRouteMocks.bookDetailQuery).toHaveBeenCalledWith(9);
		expect(
			bookDetailRouteMocks.downloadProfilesListQuery,
		).toHaveBeenCalledTimes(1);
		expect(bookDetailRouteMocks.userSettingsQuery).toHaveBeenCalledWith(
			"book-editions",
		);

		const nullBookEnsureQueryData = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce({});

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: nullBookEnsureQueryData,
					},
				},
				params: { bookId: "9" },
			}),
		).rejects.toThrow("not-found");

		const upstreamError = new Error("boom");
		const unexpectedEnsureQueryData = vi
			.fn()
			.mockRejectedValueOnce(upstreamError)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce({});

		await expect(
			routeConfig.loader({
				context: {
					queryClient: {
						ensureQueryData: unexpectedEnsureQueryData,
					},
				},
				params: { bookId: "9" },
			}),
		).rejects.toBe(upstreamError);
	});

	it("renders the detail shell, shows the unmonitor flow, and toggles the search tab", async () => {
		bookDetailRouteMocks.book = {
			autoSwitchEdition: 1,
			authorDownloadProfileIds: [11, 12],
			bookAuthors: [
				{
					authorId: 4,
					authorName: "Frank Herbert",
					foreignAuthorId: "frank-herbert",
					isPrimary: true,
				},
				{
					authorId: 5,
					authorName: "Brian Herbert",
					foreignAuthorId: "brian-herbert",
					isPrimary: false,
				},
			],
			description: "A desert planet epic.",
			downloadProfileIds: [11],
			editions: [],
			fileCount: 2,
			files: [{ path: "/books/dune.epub" }],
			foreignBookId: "hardcover-1",
			id: 9,
			images: [{ coverType: "cover", url: "/covers/dune.jpg" }],
			languages: [
				{ language: "English", languageCode: "en" },
				{ language: "French", languageCode: "fr" },
			],
			metadataSourceMissingSince: null,
			missingEditionsCount: 0,
			releaseDate: "1965-08-01",
			rating: 4.5,
			ratingsCount: 1_234,
			series: [{ position: 1, title: "Dune" }],
			slug: "dune",
			title: "Dune",
			usersCount: 56_000,
		};
		bookDetailRouteMocks.downloadProfiles = [
			{
				contentType: "ebook",
				icon: "book",
				id: 11,
				language: "en",
				name: "4K",
			},
			{
				contentType: "audiobook",
				icon: "headphones",
				id: 12,
				language: "fr",
				name: "Audio",
			},
		];

		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};

		await renderWithProviders(<routeConfig.component />);

		await expect
			.element(page.getByText("Frank Herbert").first())
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Dune");
		await expect
			.element(page.getByRole("button", { name: "toggle-4K" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "toggle-Audio" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId("search-releases-tab"))
			.toHaveAttribute("data-enabled", "false");

		await page.getByRole("button", { name: "Search Releases" }).click();
		await expect
			.element(page.getByTestId("search-releases-tab"))
			.toHaveAttribute("data-enabled", "true");

		await page.getByRole("button", { name: "toggle-4K" }).click();
		await expect
			.element(page.getByTestId("unmonitor-dialog"))
			.toHaveTextContent("4K");
		expect(bookDetailRouteMocks.navigate).not.toHaveBeenCalled();
	});

	it("renders metadata warnings when the book is missing upstream metadata", async () => {
		bookDetailRouteMocks.book = {
			autoSwitchEdition: 0,
			bookAuthors: [
				{
					authorId: 4,
					authorName: "Frank Herbert",
					foreignAuthorId: "frank-herbert",
					isPrimary: true,
				},
			],
			description: null,
			downloadProfileIds: [],
			editions: [],
			fileCount: 1,
			files: [],
			foreignBookId: null,
			id: 9,
			images: [],
			languages: [],
			metadataSourceMissingSince: new Date("2024-01-01T00:00:00.000Z"),
			missingEditionsCount: 0,
			releaseDate: null,
			rating: null,
			ratingsCount: null,
			series: [],
			slug: null,
			title: "Dune",
			usersCount: null,
		};
		bookDetailRouteMocks.downloadProfiles = [
			{
				contentType: "ebook",
				icon: "book",
				id: 11,
				language: "en",
				name: "4K",
			},
		];

		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};

		await renderWithProviders(<routeConfig.component />);

		await expect
			.element(page.getByTestId("metadata-warning"))
			.toHaveTextContent("book:Dune");
		await expect
			.element(page.getByTestId("profile-toggle-icons"))
			.not.toBeInTheDocument();
	});
});
