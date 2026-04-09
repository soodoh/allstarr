import userEvent from "@testing-library/user-event";
import { createContext, type ReactNode, useContext } from "react";
import type {
	BookLanguage,
	HardcoverBookDetail,
	HardcoverSearchItem,
} from "src/server/search";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bookPreviewModalMocks = vi.hoisted(() => ({
	authorExists: undefined as { id: string } | undefined,
	bookDetail: undefined as HardcoverBookDetail | undefined,
	booksExist: [] as Array<{ id: number }>,
	importBook: { mutate: vi.fn() },
	languages: undefined as BookLanguage[] | undefined,
	navigate: vi.fn(),
	profiles: [] as Array<{
		contentType: string;
		icon: string;
		id: number;
		name: string;
	}>,
	query: vi.fn(),
	upsertSettings: { mutate: vi.fn() },
}));

const selectContext = createContext<{
	onValueChange?: (value: string) => void;
	value?: string;
} | null>(null);

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			bookPreviewModalMocks.query(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => bookPreviewModalMocks.navigate,
}));

vi.mock("src/components/bookshelf/books/book-detail-content", () => ({
	default: ({
		book,
		children,
	}: {
		book: {
			authorName: string | null;
			availableLanguages: Array<{ code: string; name: string }> | null;
			coverUrl: string | null;
			hardcoverUrl: string | null;
			overview: string | null;
			releaseDate: string | null;
			series: Array<{ position: string | null; title: string }> | null;
			title: string;
		};
		children: ReactNode;
	}) => (
		<div data-testid="book-detail-content">
			<h2>{book.title}</h2>
			{book.authorName ? <p>{book.authorName}</p> : null}
			{book.releaseDate ? <p>{book.releaseDate}</p> : null}
			{book.series?.length ? (
				<p>{book.series.map((s) => s.title).join(", ")}</p>
			) : null}
			{book.availableLanguages?.length ? (
				<p>
					{book.availableLanguages.map((language) => language.name).join(", ")}
				</p>
			) : null}
			{book.overview ? <p>{book.overview}</p> : null}
			{book.hardcoverUrl ? (
				<a href={book.hardcoverUrl}>View on Hardcover</a>
			) : null}
			{children}
		</div>
	),
}));

vi.mock("src/components/shared/profile-checkbox-group", () => ({
	default: ({
		onToggle,
		profiles,
		selectedIds,
	}: {
		onToggle: (id: number) => void;
		profiles: Array<{ id: number; name: string }>;
		selectedIds: number[];
	}) => (
		<div>
			{profiles.map((profile) => (
				<button
					key={profile.id}
					onClick={() => onToggle(profile.id)}
					type="button"
				>
					{profile.name}:
					{selectedIds.includes(profile.id) ? "selected" : "idle"}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		asChild,
		children,
		disabled,
		onClick,
	}: {
		asChild?: boolean;
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) =>
		asChild ? (
			children
		) : (
			<button disabled={disabled} onClick={onClick} type="button">
				{children}
			</button>
		),
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({
		children,
	}: {
		children: ReactNode;
		onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
	}) => <div>{children}</div>,
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value?: string;
	}) => (
		<selectContext.Provider value={{ onValueChange, value }}>
			<div data-value={value}>{children}</div>
		</selectContext.Provider>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
		const ctx = useContext(selectContext);
		return (
			<button onClick={() => ctx?.onValueChange?.(value)} type="button">
				{children}
			</button>
		);
	},
	SelectTrigger: ({ children }: { children?: ReactNode }) => (
		<div>{children}</div>
	),
	SelectValue: () => null,
}));

vi.mock("src/hooks/mutations", () => ({
	useImportHardcoverBook: () => bookPreviewModalMocks.importBook,
}));

vi.mock("src/hooks/mutations/user-settings", () => ({
	useUpsertUserSettings: () => bookPreviewModalMocks.upsertSettings,
}));

vi.mock("src/lib/queries", () => ({
	authorExistsQuery: (foreignAuthorId: string) => ({
		queryKey: ["authors", "existence", foreignAuthorId],
	}),
	booksExistQuery: (foreignBookIds: string[]) => ({
		queryKey: ["books", "existence", ...foreignBookIds],
	}),
	downloadProfilesListQuery: () => ({
		queryKey: ["downloadProfiles", "list"],
	}),
	hardcoverBookLanguagesQuery: (foreignBookId: number) => ({
		queryKey: ["hardcover", "bookLanguages", foreignBookId],
	}),
	hardcoverSingleBookQuery: (foreignBookId: number) => ({
		queryKey: ["hardcover", "bookDetail", foreignBookId],
	}),
}));

import BookPreviewModal from "./book-preview-modal";

const previewBook = {
	coverUrl: "/preview-book.jpg",
	description: "Search result overview.",
	hardcoverUrl: "https://hardcover.app/books/dune",
	id: "9001",
	readers: 100,
	releaseYear: 2001,
	slug: "dune",
	subtitle: "Frank Herbert",
	title: "Dune",
	type: "book",
} as HardcoverSearchItem;

const hardcoverBook = {
	coverUrl: "/hc-cover.jpg",
	contributors: [{ id: "10", name: "Jane Doe" }],
	description: "Hardcover description.",
	id: "9001",
	rating: 4.2,
	ratingsCount: 123,
	releaseDate: "2002-03-04",
	releaseYear: 2002,
	series: [{ id: "1", position: "1", title: "Saga" }],
	slug: "dune",
	title: "Dune",
	usersCount: 456,
} as HardcoverBookDetail;

describe("BookPreviewModal", () => {
	beforeEach(() => {
		bookPreviewModalMocks.authorExists = undefined;
		bookPreviewModalMocks.bookDetail = undefined;
		bookPreviewModalMocks.booksExist = [];
		bookPreviewModalMocks.importBook.mutate.mockReset();
		bookPreviewModalMocks.languages = [];
		bookPreviewModalMocks.navigate.mockReset();
		bookPreviewModalMocks.profiles = [];
		bookPreviewModalMocks.query.mockImplementation(
			(options: { queryKey?: unknown[] }) => {
				const queryKey = options.queryKey ?? [];
				if (queryKey[0] === "books" && queryKey[1] === "existence") {
					return {
						data: bookPreviewModalMocks.booksExist,
						isLoading: false,
					};
				}
				if (queryKey[0] === "hardcover" && queryKey[1] === "bookDetail") {
					return {
						data: bookPreviewModalMocks.bookDetail,
						isLoading: false,
					};
				}
				if (queryKey[0] === "hardcover" && queryKey[1] === "bookLanguages") {
					return {
						data: bookPreviewModalMocks.languages,
						isLoading: false,
					};
				}
				if (queryKey[0] === "authors" && queryKey[1] === "existence") {
					return {
						data: bookPreviewModalMocks.authorExists,
						isLoading: false,
					};
				}
				if (queryKey[0] === "downloadProfiles") {
					return {
						data: bookPreviewModalMocks.profiles,
						isLoading: false,
					};
				}
				return {
					data: undefined,
					isLoading: false,
				};
			},
		);
	});

	it("renders book details and submits the add-author flow", async () => {
		const user = userEvent.setup();
		bookPreviewModalMocks.bookDetail = hardcoverBook;
		bookPreviewModalMocks.languages = [
			{ code: "en", name: "English", readers: 200 },
			{ code: "fr", name: "French", readers: 5 },
		];
		bookPreviewModalMocks.profiles = [
			{
				contentType: "ebook",
				icon: "book-open",
				id: 11,
				name: "EPUB",
			},
			{
				contentType: "audiobook",
				icon: "headphones",
				id: 12,
				name: "Audiobook",
			},
			{
				contentType: "movie",
				icon: "film",
				id: 13,
				name: "Movie",
			},
		];

		const onOpenChange = vi.fn();
		const { container, getByText, queryByText } = renderWithProviders(
			<BookPreviewModal
				addDefaults={{
					downloadProfileIds: [12],
					monitorNewBooks: "new",
					monitorOption: "latest",
					searchOnAdd: true,
				}}
				book={previewBook}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		expect(container).toHaveTextContent("Dune");
		expect(getByText("Jane Doe")).toBeInTheDocument();
		expect(getByText("2002-03-04")).toBeInTheDocument();
		expect(getByText("Saga")).toBeInTheDocument();
		expect(getByText("English, French")).toBeInTheDocument();
		expect(getByText("Hardcover description.")).toBeInTheDocument();
		expect(
			container.querySelector('a[href="https://hardcover.app/books/dune"]'),
		).not.toBeNull();

		await user.click(getByText("Add Author & Monitor Book"));
		expect(getByText("Monitor series (Saga)")).toBeInTheDocument();
		expect(queryByText("Movie:idle")).toBeNull();

		await user.click(getByText("EPUB:idle"));
		await user.click(getByText("Monitor series (Saga)"));
		expect(getByText("EPUB:selected")).toBeInTheDocument();

		await user.click(getByText("Confirm"));

		expect(bookPreviewModalMocks.upsertSettings.mutate).toHaveBeenCalledWith({
			addDefaults: {
				downloadProfileIds: [12, 11],
				monitorNewBooks: "new",
				monitorOption: "latest",
				searchOnAdd: true,
			},
			tableId: "books",
		});
		expect(bookPreviewModalMocks.importBook.mutate).toHaveBeenCalledWith({
			downloadProfileIds: [12, 11],
			foreignBookId: 9001,
			monitorNewBooks: "new",
			monitorOption: "latest",
			monitorSeries: true,
			searchOnAdd: true,
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("navigates to the local book when the preview is already in the library", async () => {
		const user = userEvent.setup();
		bookPreviewModalMocks.bookDetail = hardcoverBook;
		bookPreviewModalMocks.booksExist = [{ id: 55 }];

		const onOpenChange = vi.fn();
		const { getByText } = renderWithProviders(
			<BookPreviewModal book={previewBook} onOpenChange={onOpenChange} open />,
		);

		expect(getByText("View on Bookshelf")).toBeInTheDocument();
		await user.click(getByText("View on Bookshelf"));
		expect(bookPreviewModalMocks.navigate).toHaveBeenCalledWith({
			params: { bookId: "55" },
			to: "/books/$bookId",
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("renders fallback hardcover data when the Hardcover detail query is empty", () => {
		bookPreviewModalMocks.authorExists = { id: "10" };
		bookPreviewModalMocks.bookDetail = undefined;
		bookPreviewModalMocks.languages = undefined;

		const { container, getByText, queryByText, queryByLabelText } =
			renderWithProviders(
				<BookPreviewModal book={previewBook} onOpenChange={vi.fn()} open />,
			);

		expect(getByText("Frank Herbert")).toBeInTheDocument();
		expect(getByText("2001")).toBeInTheDocument();
		expect(getByText("Search result overview.")).toBeInTheDocument();
		expect(queryByText("Saga")).toBeNull();
		expect(queryByLabelText("Open on Hardcover")).not.toBeNull();
		expect(
			container.querySelector('a[href="https://hardcover.app/books/dune"]'),
		).not.toBeNull();
	});

	it("hides add controls for existing authors and cancels the inline form", async () => {
		const user = userEvent.setup();
		bookPreviewModalMocks.bookDetail = {
			...hardcoverBook,
			series: [],
			contributors: [{ id: "10", name: "Jane Doe" }],
		};
		bookPreviewModalMocks.authorExists = { id: "10" };
		bookPreviewModalMocks.profiles = [
			{
				contentType: "ebook",
				icon: "book-open",
				id: 11,
				name: "EPUB",
			},
		];

		const onOpenChange = vi.fn();
		const { getByText, queryByText } = renderWithProviders(
			<BookPreviewModal
				addDefaults={{
					downloadProfileIds: [11],
					monitorNewBooks: "all",
					monitorOption: "existing",
					searchOnAdd: true,
				}}
				book={previewBook}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await user.click(getByText("Add Author & Monitor Book"));
		expect(getByText("Monitor Book")).toBeInTheDocument();
		expect(queryByText("Monitor series (Saga)")).toBeNull();

		await user.click(getByText("Cancel"));
		expect(queryByText("Monitor Book")).toBeNull();
		expect(getByText("Add Author & Monitor Book")).toBeInTheDocument();
	});

	it("lets the add form select none for monitoring and submit the payload", async () => {
		const user = userEvent.setup();
		bookPreviewModalMocks.bookDetail = {
			...hardcoverBook,
			series: [],
		};
		bookPreviewModalMocks.authorExists = undefined;
		bookPreviewModalMocks.profiles = [
			{
				contentType: "ebook",
				icon: "book-open",
				id: 11,
				name: "EPUB",
			},
		];

		const onOpenChange = vi.fn();
		const { getAllByRole, getByText, queryByText } = renderWithProviders(
			<BookPreviewModal
				addDefaults={{
					downloadProfileIds: [],
					monitorNewBooks: "new",
					monitorOption: "future",
					searchOnAdd: false,
				}}
				book={previewBook}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await user.click(getByText("Add Author & Monitor Book"));
		await user.click(getAllByRole("button", { name: "None" })[0]);
		await user.click(getByText("Confirm"));

		expect(bookPreviewModalMocks.upsertSettings.mutate).toHaveBeenCalledWith({
			addDefaults: {
				downloadProfileIds: [],
				monitorNewBooks: "none",
				monitorOption: "none",
				searchOnAdd: false,
			},
			tableId: "books",
		});
		expect(bookPreviewModalMocks.importBook.mutate).toHaveBeenCalledWith({
			downloadProfileIds: [],
			foreignBookId: 9001,
			monitorNewBooks: "none",
			monitorOption: "none",
			monitorSeries: false,
			searchOnAdd: false,
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(queryByText("Monitor series (Saga)")).toBeNull();
	});
});
