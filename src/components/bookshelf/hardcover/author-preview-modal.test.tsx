import { createContext, type ReactNode, useContext } from "react";
import type {
	HardcoverAuthorDetail,
	HardcoverSearchItem,
} from "src/server/search";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const authorPreviewModalMocks = vi.hoisted(() => ({
	existingAuthor: undefined as { id: string } | undefined,
	fullAuthor: undefined as HardcoverAuthorDetail | undefined,
	importAuthor: { mutate: vi.fn() },
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
			authorPreviewModalMocks.query(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		onClick,
		params,
		to,
	}: {
		children: ReactNode;
		onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
		params?: Record<string, string>;
		to: string;
	}) => (
		<a
			href={to.replace("$authorId", params?.authorId ?? "")}
			onClick={(e) => {
				e.preventDefault();
				onClick?.(e);
			}}
		>
			{children}
		</a>
	),
}));

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({ alt, src }: { alt: string; src: string | null }) => (
		<img alt={alt} src={src ?? ""} />
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

vi.mock("src/components/ui/skeleton", () => ({
	default: ({ className }: { className?: string }) => (
		<div data-skeleton className={className} />
	),
}));

vi.mock("src/hooks/mutations", () => ({
	useImportHardcoverAuthor: () => authorPreviewModalMocks.importAuthor,
}));

vi.mock("src/hooks/mutations/user-settings", () => ({
	useUpsertUserSettings: () => authorPreviewModalMocks.upsertSettings,
}));

vi.mock("src/lib/queries", () => ({
	authorExistsQuery: (foreignAuthorId: string) => ({
		queryKey: ["authors", "existence", foreignAuthorId],
	}),
	downloadProfilesListQuery: () => ({
		queryKey: ["downloadProfiles", "list"],
	}),
	hardcoverAuthorQuery: (foreignAuthorId: number) => ({
		queryKey: ["hardcover", "author", foreignAuthorId],
	}),
}));

import AuthorPreviewModal from "./author-preview-modal";

const previewAuthor = {
	coverUrl: "/preview-author.jpg",
	description: "Search result biography.",
	hardcoverUrl: "https://hardcover.app/authors/isaac-asimov",
	id: "101",
	readers: 42,
	releaseYear: null,
	slug: "isaac-asimov",
	subtitle: "Foundation series",
	title: "Isaac Asimov",
	type: "author",
} as HardcoverSearchItem;

const fullAuthor = {
	bio: "A prolific science fiction author.",
	booksCount: 42,
	bornYear: 1920,
	deathYear: 2010,
	hardcoverUrl: "https://hardcover.app/authors/isaac-asimov",
	id: "101",
	imageUrl: "/full-author.jpg",
	languages: [],
	name: "Isaac Asimov",
	page: 1,
	pageSize: 1,
	selectedLanguage: "en",
	slug: "isaac-asimov",
	sortBy: "readers" as const,
	sortDir: "desc" as const,
	totalBooks: 42,
	totalPages: 1,
	books: [],
} as HardcoverAuthorDetail;

describe("AuthorPreviewModal", () => {
	beforeEach(() => {
		authorPreviewModalMocks.existingAuthor = undefined;
		authorPreviewModalMocks.fullAuthor = undefined;
		authorPreviewModalMocks.importAuthor.mutate.mockReset();
		authorPreviewModalMocks.profiles = [];
		authorPreviewModalMocks.query.mockImplementation(
			(options: { queryKey?: unknown[] }) => {
				const queryKey = options.queryKey ?? [];
				if (queryKey[0] === "hardcover" && queryKey[1] === "author") {
					return {
						data: authorPreviewModalMocks.fullAuthor,
						isLoading: false,
					};
				}
				if (queryKey[0] === "authors" && queryKey[1] === "existence") {
					return {
						data: authorPreviewModalMocks.existingAuthor,
						isLoading: false,
					};
				}
				if (queryKey[0] === "downloadProfiles") {
					return {
						data: authorPreviewModalMocks.profiles,
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

	it("renders author details and submits the add-to-bookshelf flow", async () => {
		authorPreviewModalMocks.fullAuthor = fullAuthor;
		authorPreviewModalMocks.profiles = [
			{
				contentType: "ebook",
				icon: "book-open",
				id: 1,
				name: "EPUB",
			},
			{
				contentType: "audiobook",
				icon: "headphones",
				id: 2,
				name: "Audiobook",
			},
			{
				contentType: "movie",
				icon: "film",
				id: 3,
				name: "Movie",
			},
		];

		const onOpenChange = vi.fn();
		const { container } = await renderWithProviders(
			<AuthorPreviewModal
				addDefaults={{
					downloadProfileIds: [2],
					monitorNewBooks: "new",
					monitorOption: "future",
					searchOnAdd: true,
				}}
				author={previewAuthor}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		expect(container).toHaveTextContent("Isaac Asimov");
		await expect.element(page.getByText("1920–2010")).toBeInTheDocument();
		await expect.element(page.getByText("42 books")).toBeInTheDocument();
		await expect
			.element(page.getByText("A prolific science fiction author."))
			.toBeInTheDocument();
		expect(
			container.querySelector('img[alt="Isaac Asimov photo"]'),
		).not.toBeNull();
		expect(
			container.querySelector(
				'a[href="https://hardcover.app/authors/isaac-asimov"]',
			),
		).not.toBeNull();

		await page.getByText("Add to Bookshelf").click();
		await expect.element(page.getByText("Movie:idle")).not.toBeInTheDocument();

		await page.getByText("EPUB:idle").click();
		await expect.element(page.getByText("EPUB:selected")).toBeInTheDocument();

		await page.getByText("Confirm").click();

		expect(authorPreviewModalMocks.upsertSettings.mutate).toHaveBeenCalledWith({
			addDefaults: {
				downloadProfileIds: [2, 1],
				monitorNewBooks: "new",
				monitorOption: "future",
				searchOnAdd: true,
			},
			tableId: "books",
		});
		expect(authorPreviewModalMocks.importAuthor.mutate).toHaveBeenCalledWith({
			downloadProfileIds: [2, 1],
			foreignAuthorId: 101,
			monitorNewBooks: "new",
			monitorOption: "future",
			searchOnAdd: true,
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("shows loading skeletons while the author query is pending", async () => {
		authorPreviewModalMocks.query.mockImplementation(
			(options: { queryKey?: unknown[] }) => {
				const queryKey = options.queryKey ?? [];
				if (queryKey[0] === "hardcover" && queryKey[1] === "author") {
					return {
						data: undefined,
						isLoading: true,
					};
				}
				return {
					data: undefined,
					isLoading: false,
				};
			},
		);

		const { container } = await renderWithProviders(
			<AuthorPreviewModal author={previewAuthor} onOpenChange={vi.fn()} open />,
		);

		expect(
			container.querySelectorAll("[data-skeleton]").length,
		).toBeGreaterThan(0);
		await expect.element(page.getByText("Add to Bookshelf")).toBeDisabled();
		await expect
			.element(page.getByText("Search result biography."))
			.not.toBeInTheDocument();
	});

	it("hides the bio when absent and lets the add form cancel cleanly", async () => {
		const authorWithoutHardcoverLink = {
			...previewAuthor,
			hardcoverUrl: null,
		};
		authorPreviewModalMocks.fullAuthor = {
			...fullAuthor,
			bio: null,
			booksCount: null,
			hardcoverUrl: null,
		};
		authorPreviewModalMocks.profiles = [
			{
				contentType: "ebook",
				icon: "book-open",
				id: 1,
				name: "EPUB",
			},
		];

		const onOpenChange = vi.fn();
		await renderWithProviders(
			<AuthorPreviewModal
				addDefaults={{
					downloadProfileIds: [],
					monitorNewBooks: "all",
					monitorOption: "future",
					searchOnAdd: false,
				}}
				author={authorWithoutHardcoverLink}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await expect
			.element(page.getByText("A prolific science fiction author."))
			.not.toBeInTheDocument();
		await expect.element(page.getByText(/books$/)).not.toBeInTheDocument();
		await expect
			.element(page.getByLabelText("Open on Hardcover"))
			.not.toBeInTheDocument();

		await page.getByText("Add to Bookshelf").click();
		await page.getByText("Cancel").click();

		await expect
			.element(page.getByText("Add to Bookshelf"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Monitor")).not.toBeInTheDocument();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("switches monitor modes to none and submits the hidden profile state", async () => {
		authorPreviewModalMocks.fullAuthor = fullAuthor;
		authorPreviewModalMocks.profiles = [
			{
				contentType: "ebook",
				icon: "book-open",
				id: 1,
				name: "EPUB",
			},
		];

		const onOpenChange = vi.fn();
		await renderWithProviders(
			<AuthorPreviewModal
				addDefaults={{
					downloadProfileIds: [],
					monitorNewBooks: "new",
					monitorOption: "future",
					searchOnAdd: false,
				}}
				author={previewAuthor}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await page.getByText("Add to Bookshelf").click();
		await page.getByRole("button", { name: "None" }).first().click();
		await page.getByText("Confirm").click();

		expect(authorPreviewModalMocks.upsertSettings.mutate).toHaveBeenCalledWith({
			addDefaults: {
				downloadProfileIds: [],
				monitorNewBooks: "none",
				monitorOption: "none",
				searchOnAdd: false,
			},
			tableId: "books",
		});
		expect(authorPreviewModalMocks.importAuthor.mutate).toHaveBeenCalledWith({
			downloadProfileIds: [],
			foreignAuthorId: 101,
			monitorNewBooks: "none",
			monitorOption: "none",
			searchOnAdd: false,
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
		await expect
			.element(page.getByText("Monitor", { exact: true }))
			.toBeInTheDocument();
	});

	it("shows the bookshelf link when the author already exists", async () => {
		authorPreviewModalMocks.fullAuthor = fullAuthor;
		authorPreviewModalMocks.existingAuthor = { id: "101" };

		const onOpenChange = vi.fn();
		const { container } = await renderWithProviders(
			<AuthorPreviewModal
				author={previewAuthor}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		expect(container.querySelector('a[href="/authors/101"]')).not.toBeNull();
		expect(
			container.querySelector(
				'a[href="https://hardcover.app/authors/isaac-asimov"]',
			),
		).not.toBeNull();

		await page.getByText("View on bookshelf").click();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
