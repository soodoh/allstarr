import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => ({
	ChevronDown: ({ className }: { className?: string }) => (
		<span className={className}>ChevronDown</span>
	),
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

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({
		alt,
		src,
		type,
	}: {
		alt: string;
		src: string | null;
		type: string;
	}) => <img alt={alt} data-type={type} src={src ?? ""} />,
}));

vi.mock("src/components/ui/popover", () => ({
	Popover: ({ children }: PropsWithChildren) => <div>{children}</div>,
	PopoverContent: ({ children }: PropsWithChildren<{ align?: string }>) => (
		<div data-testid="popover-content">{children}</div>
	),
	PopoverTrigger: ({
		children,
		className,
	}: PropsWithChildren<{ className?: string }>) => (
		<button className={className} type="button">
			{children}
		</button>
	),
}));

vi.mock("src/lib/utils", () => ({
	getCoverUrl: (images: Array<{ coverType: string; url: string }>) =>
		images[0]?.url ?? null,
}));

import BookDetailContent from "./book-detail-content";

const baseBook = {
	author: { id: 7, name: "Visible Author" },
	authorName: "Fallback Author",
	availableLanguages: [
		{ code: "en", name: "English" },
		{ code: "es", name: "Spanish" },
	],
	bookAuthors: [
		{
			authorId: 7,
			authorName: "Visible Author",
			foreignAuthorId: "visible-author",
			isPrimary: true,
		},
	],
	coverUrl: "https://covers.example/original.jpg",
	hardcoverUrl: "https://hardcover.app/books/1",
	images: [
		{ coverType: "cover", url: "https://covers.example/from-images.jpg" },
	],
	overview: "A detailed description of the selected book.",
	rating: 4.2,
	ratingVotes: 1200,
	readers: 5500,
	releaseDate: "2024-01-15",
	series: [{ position: "2", title: "Main Saga" }],
	title: "The Testing Book",
};

describe("BookDetailContent", () => {
	it("renders the detailed metadata, preferred cover image, languages, and custom children", async () => {
		const user = userEvent.setup();
		const { getByAltText, getByRole, getByText, getByTestId } =
			renderWithProviders(
				<BookDetailContent book={baseBook}>
					<div>Injected child content</div>
				</BookDetailContent>,
			);

		expect(getByAltText("The Testing Book cover")).toHaveAttribute(
			"src",
			"https://covers.example/from-images.jpg",
		);
		expect(getByText("Visible Author")).toBeInTheDocument();
		expect(getByText("2024-01-15")).toBeInTheDocument();
		expect(getByText("Main Saga #2")).toBeInTheDocument();
		expect(getByText("4.2/5")).toBeInTheDocument();
		expect(getByText("(1,200 votes)")).toBeInTheDocument();
		expect(getByText("5,500")).toBeInTheDocument();
		expect(getByRole("link", { name: "View on Hardcover" })).toHaveAttribute(
			"href",
			"https://hardcover.app/books/1",
		);
		expect(getByText("Injected child content")).toBeInTheDocument();

		await user.click(getByRole("button", { name: /English and 1 other/i }));
		expect(getByTestId("popover-content")).toHaveTextContent("English");
		expect(getByTestId("popover-content")).toHaveTextContent("Spanish");
	});

	it("falls back to the coverUrl, singular vote label, and hides optional sections when data is absent", () => {
		const sparseBook = {
			...baseBook,
			author: null,
			authorName: null,
			availableLanguages: [{ code: "en", name: "English" }],
			bookAuthors: [],
			hardcoverUrl: null,
			images: [],
			overview: null,
			ratingVotes: 1,
			readers: 0,
			releaseDate: null,
			series: null,
		};

		const { getByAltText, getByRole, queryByRole, queryByText } =
			renderWithProviders(<BookDetailContent book={sparseBook} />);

		expect(getByAltText("The Testing Book cover")).toHaveAttribute(
			"src",
			"https://covers.example/original.jpg",
		);
		expect(getByRole("button", { name: "English" })).toBeInTheDocument();
		expect(queryByRole("link", { name: "View on Hardcover" })).toBeNull();
		expect(queryByText("Description")).toBeNull();
		expect(queryByText("Readers:")).toBeNull();
		expect(queryByText("Series:")).toBeNull();
		expect(queryByText("Release Date:")).toBeNull();
		expect(queryByText("(1 vote)")).toBeInTheDocument();
	});
});
