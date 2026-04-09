import { act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createContext, type JSX, type ReactNode, useContext } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMutation() {
	return {
		isPending: false,
		mutate: vi.fn(),
	};
}

const selectContext = createContext<{
	onValueChange?: (value: string) => void;
} | null>(null);

const seriesRouteMocks = vi.hoisted(() => ({
	downloadProfilesListQuery: vi.fn(() => ({
		queryKey: ["downloadProfiles"],
	})),
	hardcoverSeriesCompleteQuery: vi.fn((ids: number[]) => ({
		queryKey: ["hardcoverSeries", ids],
	})),
	invalidate: vi.fn(),
	metadataProfileQuery: vi.fn(() => ({
		queryKey: ["metadataProfile"],
	})),
	monitorBookProfile: createMutation(),
	navigate: vi.fn(),
	pickBestEdition: vi.fn(),
	refreshSeries: createMutation(),
	seriesListQuery: vi.fn(() => ({
		queryKey: ["seriesList"],
	})),
	unmonitorBookProfile: createMutation(),
	updateSeries: createMutation(),
	useQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
	useTableColumns: vi.fn(() => ({
		visibleColumns: [
			{ key: "monitored", label: "Monitored" },
			{ key: "cover", label: "Cover" },
			{ key: "title", label: "Title" },
			{ key: "releaseDate", label: "Release Date" },
			{ key: "author", label: "Author" },
		],
	})),
	userSettingsQuery: vi.fn(() => ({
		queryKey: ["userSettings", "author-series"],
	})),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			seriesRouteMocks.useQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			seriesRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
	useNavigate: () => seriesRouteMocks.navigate,
	useRouter: () => ({
		invalidate: seriesRouteMocks.invalidate,
	}),
}));

vi.mock("src/components/bookshelf/books/additional-authors", () => ({
	default: ({
		bookAuthors,
	}: {
		bookAuthors: Array<{ authorName: string }>;
	}) => (
		<div data-testid="additional-authors">
			{bookAuthors.map((author) => author.authorName).join(",")}
		</div>
	),
}));

vi.mock("src/components/bookshelf/books/unmonitor-dialog", () => ({
	default: ({
		itemTitle,
		onConfirm,
		open,
	}: {
		itemTitle: string;
		onConfirm: (deleteFiles: boolean) => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="unmonitor-dialog">
				<div>{itemTitle}</div>
				<button onClick={() => onConfirm(true)} type="button">
					confirm-unmonitor
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/bookshelf/hardcover/book-preview-modal", () => ({
	default: ({ book, open }: { book: { title: string }; open: boolean }) =>
		open ? <div data-testid="preview-modal">{book.title}</div> : null,
}));

vi.mock("src/components/shared/column-settings-popover", () => ({
	default: ({ tableId }: { tableId: string }) => (
		<div data-testid={`column-settings-${tableId}`}>columns</div>
	),
}));

vi.mock("src/components/shared/edit-series-profiles-dialog", () => ({
	default: ({ open, seriesTitle }: { open: boolean; seriesTitle: string }) =>
		open ? <div data-testid="edit-profiles-dialog">{seriesTitle}</div> : null,
}));

vi.mock("src/components/shared/metadata-warning", () => ({
	default: ({
		itemTitle,
		onDeleted,
		type,
	}: {
		itemTitle: string;
		onDeleted?: () => void;
		type: string;
	}) => (
		<div data-testid={`metadata-warning-${type}`}>
			<span>{itemTitle}</span>
			{onDeleted ? (
				<button aria-label={`delete-${type}`} onClick={onDeleted} type="button">
					delete
				</button>
			) : null}
		</div>
	),
}));

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({ alt }: { alt: string }) => <div data-testid="cover">{alt}</div>,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({ actions, title }: { actions?: ReactNode; title: string }) => (
		<div>
			<h1>{title}</h1>
			<div>{actions}</div>
		</div>
	),
}));

vi.mock("src/components/shared/profile-toggle-icons", () => ({
	default: ({
		activeProfileIds,
		onToggle,
		profiles,
	}: {
		activeProfileIds: number[];
		onToggle: (profileId: number) => void;
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div data-testid={`profiles-${activeProfileIds.join(",")}`}>
			{profiles.map((profile) => (
				<button
					key={profile.id}
					onClick={(event) => {
						event.stopPropagation();
						onToggle(profile.id);
					}}
					type="button"
				>
					profile-{profile.id}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		"aria-label": ariaLabel,
		children,
		className,
		disabled,
		onClick,
		type = "button",
		variant,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
		type?: "button" | "submit" | "reset";
		variant?: string;
	}) => (
		<button
			aria-label={ariaLabel}
			className={className}
			data-variant={variant}
			disabled={disabled}
			onClick={onClick}
			type={type}
		>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		className,
		onChange,
		placeholder,
		value,
	}: {
		className?: string;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => (
		<input
			className={className}
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	),
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
	}) => (
		<selectContext.Provider value={{ onValueChange }}>
			<div>{children}</div>
		</selectContext.Provider>
	),
	SelectContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
		const ctx = useContext(selectContext);
		return (
			<button onClick={() => ctx?.onValueChange?.(value)} type="button">
				{children}
			</button>
		);
	},
	SelectTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<span>{placeholder}</span>
	),
}));

vi.mock("src/components/ui/skeleton", () => ({
	default: ({ className }: { className?: string }) => (
		<div className={className}>skeleton</div>
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
	TableRow: ({
		children,
		className,
		onClick,
	}: {
		children: ReactNode;
		className?: string;
		onClick?: () => void;
	}) => (
		<tr className={className} onClick={onClick}>
			{children}
		</tr>
	),
}));

vi.mock("src/hooks/mutations", () => ({
	useMonitorBookProfile: () => seriesRouteMocks.monitorBookProfile,
	useUnmonitorBookProfile: () => seriesRouteMocks.unmonitorBookProfile,
}));

vi.mock("src/hooks/mutations/series", () => ({
	useRefreshSeries: () => seriesRouteMocks.refreshSeries,
	useUpdateSeries: () => seriesRouteMocks.updateSeries,
}));

vi.mock("src/hooks/use-table-columns", () => ({
	useTableColumns: () => seriesRouteMocks.useTableColumns(),
}));

vi.mock("src/lib/editions", () => ({
	pickBestEdition: (...args: unknown[]) =>
		seriesRouteMocks.pickBestEdition(...args),
}));

vi.mock("src/lib/queries", () => ({
	downloadProfilesListQuery: () => seriesRouteMocks.downloadProfilesListQuery(),
	hardcoverSeriesCompleteQuery: (ids: number[]) =>
		seriesRouteMocks.hardcoverSeriesCompleteQuery(ids),
	metadataProfileQuery: () => seriesRouteMocks.metadataProfileQuery(),
}));

vi.mock("src/lib/queries/series", () => ({
	seriesListQuery: () => seriesRouteMocks.seriesListQuery(),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (_key: string) => seriesRouteMocks.userSettingsQuery(),
}));

import { Route } from "./index";

const downloadProfiles = [
	{ contentType: "ebook", id: 11, name: "Read" },
	{ contentType: "audiobook", id: 12, name: "Listen" },
	{ contentType: "movie", id: 99, name: "Ignore" },
];

const seriesData = {
	availableLanguages: [
		{ language: "English", languageCode: "en" },
		{ language: "French", languageCode: "fr" },
	],
	books: [
		{
			authorForeignId: "author-1",
			authorName: "Author One",
			bookAuthors: [
				{
					authorId: 1,
					authorName: "Author One",
					foreignAuthorId: "author-1",
					isPrimary: true,
				},
			],
			description: null,
			downloadProfileIds: [11],
			editions: [
				{
					asin: "ASIN-1",
					bookId: 101,
					downloadProfileIds: [11],
					format: "Hardcover",
					id: 501,
					images: [{ coverType: "default", url: "alpha-cover" }],
					isDefaultCover: true,
					isbn10: "ISBN10-1",
					isbn13: "ISBN13-1",
					languageCode: "en",
					metadataSourceMissingSince: null,
					pageCount: 320,
					releaseDate: "2023-02-01",
					score: 85,
					title: "Alpha",
					usersCount: 150,
				},
			],
			fileCount: 2,
			foreignBookId: "1010",
			id: 101,
			images: [{ coverType: "default", url: "alpha-book-cover" }],
			languageCodes: ["en"],
			metadataSourceMissingSince: null,
			missingEditionsCount: 0,
			rating: 4.6,
			ratingsCount: 1200,
			releaseDate: "2023-02-01",
			releaseYear: 2023,
			slug: "alpha",
			tags: [],
			title: "Alpha",
			usersCount: 150,
		},
		{
			authorForeignId: "author-2",
			authorName: "Author Two",
			bookAuthors: [],
			description: null,
			downloadProfileIds: [],
			editions: [],
			fileCount: 0,
			foreignBookId: "2020",
			id: 102,
			images: [],
			languageCodes: ["fr"],
			metadataSourceMissingSince: new Date("2024-01-01"),
			missingEditionsCount: 0,
			rating: null,
			ratingsCount: null,
			releaseDate: null,
			releaseYear: 2022,
			slug: "beta",
			tags: [],
			title: "Beta",
			usersCount: 25,
		},
	],
	series: [
		{
			bookCount: 2,
			books: [
				{ bookId: 101, position: "1" },
				{ bookId: 102, position: "2" },
			],
			downloadProfileIds: [11],
			foreignSeriesId: "777",
			id: 1,
			isCompleted: true,
			monitored: true,
			title: "Chronicles",
		},
		{
			bookCount: 1,
			books: [{ bookId: 102, position: "1" }],
			downloadProfileIds: [],
			foreignSeriesId: null,
			id: 2,
			isCompleted: false,
			monitored: false,
			title: "Mysteries",
		},
	],
};

const hardcoverSeries = [
	{
		books: [
			{
				authorName: "Author One",
				coverUrl: "alpha-side-cover",
				editions: [
					{
						asin: "ALPHA-EXTRA",
						coverUrl: "alpha-side-cover",
						format: "Hardcover",
						isDefaultCover: true,
						isbn10: "SIDE10",
						isbn13: "SIDE13",
						languageCode: "en",
						pageCount: 220,
						releaseDate: "2023-05-01",
						score: 40,
						title: "Alpha Side Story",
					},
				],
				foreignBookId: 3030,
				position: "1.5",
				rating: 3.9,
				releaseDate: "2023-05-01",
				releaseYear: 2023,
				slug: "alpha-side-story",
				title: "Alpha Side Story",
				usersCount: 35,
			},
			{
				authorName: "Guest Writer",
				coverUrl: "gamma-cover",
				editions: [
					{
						asin: "GAMMA-ASIN",
						coverUrl: "gamma-edition-cover",
						format: "Paperback",
						isDefaultCover: false,
						isbn10: "GAMMA10",
						isbn13: "GAMMA13",
						languageCode: "en",
						pageCount: 280,
						releaseDate: "2024-03-03",
						score: 70,
						title: "Gamma Special Edition",
					},
				],
				foreignBookId: 4040,
				position: "3",
				rating: 4.8,
				releaseDate: null,
				releaseYear: 2024,
				slug: "gamma",
				title: "Gamma",
				usersCount: 450,
			},
		],
		foreignSeriesId: 777,
	},
];

const warningSeriesPayload = {
	...seriesData,
	books: [
		{
			...seriesData.books[0],
			metadataSourceMissingSince: new Date("2024-01-02"),
			languageCodes: ["en"],
		},
		{
			...seriesData.books[1],
			languageCodes: ["en"],
			metadataSourceMissingSince: null,
			missingEditionsCount: 2,
		},
	],
	series: [
		{
			...seriesData.series[0],
			books: [
				{ bookId: 101, position: "1" },
				{ bookId: 102, position: "2" },
			],
		},
	],
} as unknown as typeof seriesData;

const dedupeSeriesPayload = {
	...seriesData,
	books: [
		{
			...seriesData.books[0],
			languageCodes: ["en"],
		},
		{
			...seriesData.books[1],
			languageCodes: ["en"],
			metadataSourceMissingSince: null,
			missingEditionsCount: 0,
		},
	],
	series: [
		{
			...seriesData.series[0],
			books: [
				{ bookId: 101, position: "1" },
				{ bookId: 102, position: "4" },
			],
		},
	],
} as unknown as typeof seriesData;

const dedupeHardcoverPayload = [
	{
		books: [
			{
				authorName: "Shadow Author",
				coverUrl: "beta-shadow-cover",
				editions: [
					{
						asin: "BETA-SHADOW-ASIN",
						coverUrl: "beta-shadow-cover",
						format: "Hardcover",
						isDefaultCover: true,
						isbn10: "BETA-SHADOW-10",
						isbn13: "BETA-SHADOW-13",
						languageCode: "en",
						pageCount: 300,
						releaseDate: "2024-02-01",
						score: 60,
						title: "Beta Shadow",
					},
				],
				foreignBookId: 3030,
				position: "4",
				rating: 3.2,
				releaseDate: "2024-02-01",
				releaseYear: 2024,
				slug: "beta-shadow",
				title: "Beta Shadow",
				usersCount: 999,
			},
			{
				authorName: "Low Users",
				coverUrl: "gamma-low-cover",
				editions: [
					{
						asin: "GAMMA-LOW-ASIN",
						coverUrl: "gamma-low-cover",
						format: "Paperback",
						isDefaultCover: true,
						isbn10: "GAMMA-LOW-10",
						isbn13: "GAMMA-LOW-13",
						languageCode: "en",
						pageCount: 210,
						releaseDate: "2024-03-01",
						score: 42,
						title: "Gamma Low",
					},
				],
				foreignBookId: 4040,
				position: "5",
				rating: 3.5,
				releaseDate: "2024-03-01",
				releaseYear: 2024,
				slug: "gamma-low",
				title: "Gamma Low",
				usersCount: 35,
			},
			{
				authorName: "High Users",
				coverUrl: "gamma-high-cover",
				editions: [
					{
						asin: "GAMMA-HIGH-ASIN",
						coverUrl: "gamma-high-cover",
						format: "Paperback",
						isDefaultCover: true,
						isbn10: "GAMMA-HIGH-10",
						isbn13: "GAMMA-HIGH-13",
						languageCode: "en",
						pageCount: 220,
						releaseDate: "2024-03-01",
						score: 95,
						title: "Gamma High",
					},
				],
				foreignBookId: 5050,
				position: "5",
				rating: 4.8,
				releaseDate: "2024-03-01",
				releaseYear: 2024,
				slug: "gamma-high",
				title: "Gamma High",
				usersCount: 450,
			},
			{
				authorName: "No IDs",
				coverUrl: "missing-ids-cover",
				editions: [
					{
						coverUrl: "missing-ids-cover",
						format: "Paperback",
						isDefaultCover: true,
						languageCode: "en",
						pageCount: 180,
						releaseDate: "2024-04-01",
						score: 12,
						title: "Missing IDs",
					},
				],
				foreignBookId: 6060,
				position: "6",
				rating: 1.8,
				releaseDate: "2024-04-01",
				releaseYear: 2024,
				slug: "missing-ids",
				title: "Missing IDs",
				usersCount: 80,
			},
			{
				authorName: "No Release Date",
				coverUrl: "missing-release-cover",
				editions: [
					{
						asin: "MISSING-RELEASE-ASIN",
						coverUrl: "missing-release-cover",
						format: "Paperback",
						isDefaultCover: true,
						isbn10: "MISSING-RELEASE-10",
						isbn13: null,
						languageCode: "en",
						pageCount: 190,
						releaseDate: null,
						score: 15,
						title: "Missing Release Date",
					},
				],
				foreignBookId: 7070,
				position: "7",
				rating: 2.1,
				releaseDate: null,
				releaseYear: 2024,
				slug: "missing-release",
				title: "Missing Release Date",
				usersCount: 90,
			},
		],
		foreignSeriesId: 777,
	},
] as const;

const noMonitoredBooksPayload = {
	availableLanguages: [{ language: "English", languageCode: "en" }],
	books: [
		{
			...seriesData.books[1],
			authorForeignId: "author-filtered",
			authorName: "Filtered Author",
			downloadProfileIds: [],
			foreignBookId: "9010",
			id: 901,
			languageCodes: ["fr"],
			metadataSourceMissingSince: null,
			missingEditionsCount: 0,
			releaseDate: null,
			releaseYear: 2024,
			slug: "filtered-alpha",
			title: "Filtered Alpha",
			usersCount: 10,
			bookAuthors: [],
			editions: [],
			images: [],
		},
	],
	series: [
		{
			bookCount: 1,
			books: [{ bookId: 901, position: "1" }],
			downloadProfileIds: [],
			foreignSeriesId: null,
			id: 9,
			isCompleted: false,
			monitored: false,
			title: "Filtered Series",
		},
	],
} as unknown as typeof seriesData;

function installQueryMocks({
	seriesPayload = seriesData,
	downloadProfilesPayload = downloadProfiles,
	metadataProfile = {
		skipMissingIsbnAsin: true,
		skipMissingReleaseDate: false,
	},
	hardcoverPayload = hardcoverSeries,
	isLoadingSeries = false,
}: {
	hardcoverPayload?: unknown[];
	isLoadingSeries?: boolean;
	metadataProfile?: {
		skipMissingIsbnAsin: boolean;
		skipMissingReleaseDate: boolean;
	};
	downloadProfilesPayload?: typeof downloadProfiles;
	seriesPayload?: typeof seriesData;
} = {}) {
	seriesRouteMocks.useSuspenseQuery.mockImplementation(
		(query: { queryKey: [string, ...unknown[]] }) => {
			switch (query.queryKey[0]) {
				case "seriesList":
					return { data: seriesPayload };
				case "downloadProfiles":
					return { data: downloadProfilesPayload };
				case "metadataProfile":
					return { data: metadataProfile };
				default:
					throw new Error(`Unhandled suspense query: ${query.queryKey[0]}`);
			}
		},
	);
	seriesRouteMocks.useQuery.mockImplementation(
		(query: { queryKey: [string, ...unknown[]] }) => {
			if (query.queryKey[0] === "hardcoverSeries") {
				return {
					data: hardcoverPayload,
					isLoading: isLoadingSeries,
				};
			}
			throw new Error(`Unhandled query: ${query.queryKey[0]}`);
		},
	);
	seriesRouteMocks.pickBestEdition.mockImplementation(
		(
			editions: Array<{
				languageCode: string | null;
				isDefaultCover?: boolean;
			}>,
			language: string,
		) => {
			if (language !== "all") {
				return (
					editions.find((edition) => edition.languageCode === language) ??
					editions[0]
				);
			}
			return editions[0];
		},
	);
}

describe("series route", () => {
	beforeEach(() => {
		vi.useRealTimers();
		seriesRouteMocks.downloadProfilesListQuery.mockClear();
		seriesRouteMocks.hardcoverSeriesCompleteQuery.mockClear();
		seriesRouteMocks.invalidate.mockClear();
		seriesRouteMocks.metadataProfileQuery.mockClear();
		seriesRouteMocks.monitorBookProfile = createMutation();
		seriesRouteMocks.navigate.mockClear();
		seriesRouteMocks.pickBestEdition.mockReset();
		seriesRouteMocks.refreshSeries = createMutation();
		seriesRouteMocks.seriesListQuery.mockClear();
		seriesRouteMocks.unmonitorBookProfile = createMutation();
		seriesRouteMocks.updateSeries = createMutation();
		seriesRouteMocks.useQuery.mockReset();
		seriesRouteMocks.useSuspenseQuery.mockReset();
		seriesRouteMocks.useTableColumns.mockImplementation(() => ({
			visibleColumns: [
				{ key: "monitored", label: "Monitored" },
				{ key: "cover", label: "Cover" },
				{ key: "title", label: "Title" },
				{ key: "releaseDate", label: "Release Date" },
				{ key: "author", label: "Author" },
			],
		}));
		seriesRouteMocks.userSettingsQuery.mockClear();
	});

	it("loads route data up front and renders the pending skeleton", async () => {
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: (query: unknown) => Promise<unknown>;
					};
				};
			}) => Promise<void>;
			pendingComponent: () => JSX.Element;
		};

		const ensureQueryData = vi.fn().mockResolvedValue(undefined);

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(seriesRouteMocks.seriesListQuery).toHaveBeenCalledTimes(1);
		expect(seriesRouteMocks.downloadProfilesListQuery).toHaveBeenCalledTimes(1);
		expect(seriesRouteMocks.metadataProfileQuery).toHaveBeenCalledTimes(1);
		expect(seriesRouteMocks.userSettingsQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledTimes(4);

		const pendingView = renderWithProviders(<routeConfig.pendingComponent />);
		expect(pendingView.getAllByText("skeleton")).toHaveLength(2);
	});

	it("renders merged series entries and wires the monitored, preview, and profile actions", async () => {
		const user = userEvent.setup();
		const routeConfig = Route as unknown as { component: () => JSX.Element };
		const Component = routeConfig.component;

		installQueryMocks();

		const {
			getAllByLabelText,
			getAllByText,
			getByLabelText,
			getByRole,
			getByTestId,
			getByText,
			queryByText,
		} = renderWithProviders(<Component />);

		expect(getByText("Series")).toBeInTheDocument();
		expect(getByText(/1\s+series/)).toBeInTheDocument();
		expect(queryByText("Loading series data from Hardcover…")).toBeNull();

		await user.click(getByText("Refresh All"));
		expect(seriesRouteMocks.refreshSeries.mutate).toHaveBeenCalledWith({});

		await user.click(getByText("Chronicles"));
		expect(getAllByText("Gamma Special Edition").length).toBeGreaterThan(0);
		expect(queryByText("Alpha Side Story")).not.toBeInTheDocument();
		expect(queryByText("Beta")).toBeNull();
		expect(getByText("Guest Writer")).toBeInTheDocument();
		expect(getByText("Author One")).toBeInTheDocument();
		expect(getByText("Chronicles")).toBeInTheDocument();
		expect(getByText("columns")).toBeInTheDocument();
		expect(getAllByText("Alpha").length).toBeGreaterThan(0);
		expect(getByText("2023-02-01")).toBeInTheDocument();

		await user.click(getByLabelText("Unmonitor series"));
		expect(seriesRouteMocks.updateSeries.mutate).toHaveBeenCalledWith({
			id: 1,
			monitored: false,
		});

		await user.click(getByRole("button", { name: "profile-12" }));
		expect(seriesRouteMocks.monitorBookProfile.mutate).toHaveBeenCalledWith({
			bookId: 101,
			downloadProfileId: 12,
		});

		await user.click(getByRole("button", { name: "profile-11" }));
		expect(getByTestId("unmonitor-dialog")).toBeInTheDocument();
		await user.click(getByRole("button", { name: "confirm-unmonitor" }));
		expect(seriesRouteMocks.unmonitorBookProfile.mutate).toHaveBeenCalledWith(
			{
				bookId: 101,
				deleteFiles: true,
				downloadProfileId: 11,
			},
			expect.objectContaining({ onSuccess: expect.any(Function) }),
		);

		await user.click(getAllByText("Alpha")[0]);
		expect(seriesRouteMocks.navigate).toHaveBeenCalledWith({
			params: { bookId: "101" },
			to: "/books/$bookId",
		});

		await user.click(getAllByText("Gamma Special Edition")[0]);
		expect(getByTestId("preview-modal")).toHaveTextContent(
			"Gamma Special Edition",
		);

		await user.click(getAllByLabelText("Edit download profiles")[0]);
		expect(getByTestId("edit-profiles-dialog")).toHaveTextContent("Chronicles");
	});

	it("supports debounced search, language filtering, and the empty-state branch", () => {
		vi.useFakeTimers();
		const routeConfig = Route as unknown as { component: () => JSX.Element };
		const Component = routeConfig.component;

		installQueryMocks({
			isLoadingSeries: true,
		});

		const { getAllByText, getByPlaceholderText, getByText, queryAllByText } =
			renderWithProviders(<Component />);

		expect(getByText(/Loading series data from Hardcover/)).toBeInTheDocument();

		fireEvent.click(getByText("French"));
		fireEvent.click(getByText("Chronicles"));
		expect(queryAllByText("Alpha")).toHaveLength(0);
		expect(getAllByText("Beta").length).toBeGreaterThan(0);

		fireEvent.change(getByPlaceholderText("Filter by series name..."), {
			target: { value: "zzz" },
		});
		act(() => {
			vi.advanceTimersByTime(300);
		});

		expect(getByText("No series match “zzz”.")).toBeInTheDocument();
	});

	it("shows metadata warnings, clears search, and invalidates after deleting a warning", async () => {
		vi.useFakeTimers();
		const routeConfig = Route as unknown as { component: () => JSX.Element };
		const Component = routeConfig.component;

		installQueryMocks({
			seriesPayload: warningSeriesPayload,
		});

		const {
			getByLabelText,
			getByPlaceholderText,
			getByText,
			getByTestId,
			queryByText,
		} = renderWithProviders(<Component />);

		fireEvent.click(getByText("Chronicles"));
		expect(getByTestId("metadata-warning-book")).toHaveTextContent("Alpha");
		expect(getByTestId("metadata-warning-book-editions")).toHaveTextContent(
			"Beta",
		);

		fireEvent.change(getByPlaceholderText("Filter by series name..."), {
			target: { value: "zzz" },
		});
		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(getByText("No series match “zzz”.")).toBeInTheDocument();

		fireEvent.click(getByLabelText("Clear search"));
		expect(queryByText("No series match “zzz”.")).toBeNull();
		expect(getByTestId("metadata-warning-book")).toBeInTheDocument();

		fireEvent.click(getByLabelText("delete-book"));
		expect(seriesRouteMocks.invalidate).toHaveBeenCalledTimes(1);
	});

	it("dedupes duplicate Hardcover entries and skips incomplete external editions", async () => {
		const user = userEvent.setup();
		const routeConfig = Route as unknown as { component: () => JSX.Element };
		const Component = routeConfig.component;

		installQueryMocks({
			seriesPayload: dedupeSeriesPayload,
			hardcoverPayload: dedupeHardcoverPayload as unknown as unknown[],
			metadataProfile: {
				skipMissingIsbnAsin: true,
				skipMissingReleaseDate: true,
			},
		});

		const { getAllByText, getByText, queryByText } = renderWithProviders(
			<Component />,
		);

		await user.click(getByText("Chronicles"));

		expect(getAllByText("Beta").length).toBeGreaterThan(0);
		expect(queryByText("Beta Shadow")).toBeNull();
		expect(queryByText("Gamma Low")).toBeNull();
		expect(getAllByText("Gamma High").length).toBeGreaterThan(0);
		expect(queryByText("Missing IDs")).toBeNull();
		expect(queryByText("Missing Release Date")).toBeNull();
	});

	it("shows the no monitored books state when every entry is filtered out", () => {
		const routeConfig = Route as unknown as { component: () => JSX.Element };
		const Component = routeConfig.component;

		installQueryMocks({
			seriesPayload: noMonitoredBooksPayload,
			hardcoverPayload: [],
		});

		const { queryByText, getByText } = renderWithProviders(<Component />);

		expect(
			getByText("No series with monitored books found."),
		).toBeInTheDocument();
		expect(queryByText("Language")).toBeNull();
	});
});
