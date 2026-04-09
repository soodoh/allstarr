import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => ({
	ChevronDown: ({ className }: { className?: string }) => (
		<span className={className}>ChevronDown</span>
	),
	ChevronsUpDown: ({ className }: { className?: string }) => (
		<span className={className}>ChevronsUpDown</span>
	),
	ChevronUp: ({ className }: { className?: string }) => (
		<span className={className}>ChevronUp</span>
	),
	Star: ({ className }: { className?: string }) => (
		<span className={className}>Star</span>
	),
}));

vi.mock("src/components/bookshelf/books/additional-authors", () => ({
	default: ({
		bookAuthors,
		currentAuthorId,
	}: {
		bookAuthors: Array<{ authorName: string }>;
		currentAuthorId?: number;
	}) => (
		<span data-testid="additional-authors">
			{bookAuthors.map((author) => author.authorName).join(", ")}:
			{currentAuthorId ?? "none"}
		</span>
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

import BaseBookTable, { type ColumnKey } from "./base-book-table";

const columns: Array<{ key: ColumnKey; sortable: boolean }> = [
	{ key: "monitored", sortable: false },
	{ key: "cover", sortable: false },
	{ key: "title", sortable: true },
	{ key: "author", sortable: true },
	{ key: "releaseDate", sortable: true },
	{ key: "readers", sortable: true },
	{ key: "rating", sortable: true },
	{ key: "format", sortable: false },
	{ key: "pages", sortable: false },
	{ key: "isbn10", sortable: false },
	{ key: "isbn13", sortable: false },
	{ key: "asin", sortable: false },
	{ key: "score", sortable: false },
	{ key: "publisher", sortable: false },
	{ key: "information", sortable: false },
	{ key: "language", sortable: false },
	{ key: "country", sortable: false },
	{ key: "series", sortable: true },
];

const rows = [
	{
		asin: "B00TEST",
		audioLength: 4500,
		authorName: null,
		bookAuthors: [
			{
				authorId: 1,
				authorName: "Frank Herbert",
				foreignAuthorId: "frank-herbert",
				isPrimary: true,
			},
		],
		bookId: 10,
		country: "US",
		coverUrl: "https://covers.example/dune.jpg",
		downloadProfileIds: [4],
		editionInformation: "Anniversary edition",
		format: "Audiobook",
		isbn10: "1234567890",
		isbn13: "9781234567897",
		key: 10,
		language: "English",
		monitored: true,
		pageCount: null,
		publisher: "Ace",
		rating: 4.5,
		ratingsCount: 1200,
		releaseDate: "2024-02-01",
		score: 98,
		series: [{ position: "1", title: "Dune" }],
		title: "Dune",
		usersCount: 5600,
	},
	{
		asin: null,
		audioLength: null,
		authorName: "Solo Author",
		bookAuthors: [],
		bookId: 11,
		country: null,
		coverUrl: null,
		downloadProfileIds: [],
		editionInformation: null,
		format: null,
		isbn10: null,
		isbn13: null,
		key: 11,
		language: null,
		monitored: false,
		pageCount: 320,
		publisher: null,
		rating: null,
		ratingsCount: 0,
		releaseDate: null,
		score: null,
		series: [],
		title: "Unknown Book",
		usersCount: null,
	},
];

describe("BaseBookTable", () => {
	it("renders column content, sortable headers, and row interactions", async () => {
		const user = userEvent.setup();
		const onRowClick = vi.fn();
		const onSort = vi.fn();
		const renderLeadingCell = vi.fn((row) => (
			<span>{`leading:${row.bookId}`}</span>
		));

		const { getAllByTestId, getAllByText, getByRole, getByText } =
			renderWithProviders(
				<BaseBookTable
					columns={columns}
					currentAuthorId={99}
					onRowClick={onRowClick}
					onSort={onSort}
					renderLeadingCell={renderLeadingCell}
					rows={rows}
					selectedRowKey={10}
					sortDir="asc"
					sortKey="title"
				/>,
			);

		expect(getByText("Dune")).toBeInTheDocument();
		expect(getByText("Unknown Book")).toBeInTheDocument();
		expect(getByText("Frank Herbert:99")).toBeInTheDocument();
		expect(getByText("Solo Author")).toBeInTheDocument();
		expect(getByText("2024-02-01")).toBeInTheDocument();
		expect(getAllByTestId("additional-authors")).toHaveLength(2);
		expect(getByText("5,600")).toBeInTheDocument();
		expect(getByText("4.5")).toBeInTheDocument();
		expect(getByText("(1,200)")).toBeInTheDocument();
		expect(getByText("Audiobook")).toBeInTheDocument();
		expect(getByText("1h 15m")).toBeInTheDocument();
		expect(getByText("320")).toBeInTheDocument();
		expect(getByText("1234567890")).toBeInTheDocument();
		expect(getByText("9781234567897")).toBeInTheDocument();
		expect(getByText("B00TEST")).toBeInTheDocument();
		expect(getByText("98")).toBeInTheDocument();
		expect(getByText("Ace")).toBeInTheDocument();
		expect(getByText("Anniversary edition")).toBeInTheDocument();
		expect(getByText("English")).toBeInTheDocument();
		expect(getByText("US")).toBeInTheDocument();
		expect(getByText("Dune (#1)")).toBeInTheDocument();
		expect(getByText("Unknown")).toBeInTheDocument();
		expect(getAllByText("—").length).toBeGreaterThan(0);
		expect(getByRole("img", { name: "Dune" })).toHaveAttribute(
			"src",
			"https://covers.example/dune.jpg",
		);
		expect(renderLeadingCell).toHaveBeenCalledTimes(2);
		expect(getByText("leading:10")).toBeInTheDocument();
		expect(getByText("leading:11")).toBeInTheDocument();
		expect(getByText("ChevronUp")).toBeInTheDocument();
		expect(getAllByText("ChevronsUpDown").length).toBeGreaterThan(0);

		await user.click(getByRole("columnheader", { name: /Title/i }));
		expect(onSort).toHaveBeenCalledWith("title");

		await user.click(getByRole("row", { name: /Unknown Book/i }));
		expect(onRowClick).toHaveBeenCalledWith(rows[1]);
		expect(getByRole("row", { name: /Dune/i }).className).toContain(
			"bg-primary/10",
		);
	});

	it("renders the custom empty message when no rows are present", () => {
		const { getByText } = renderWithProviders(
			<BaseBookTable
				columns={[{ key: "title", sortable: false }]}
				emptyMessage="Nothing to display."
				rows={[]}
			/>,
		);

		expect(getByText("Nothing to display.")).toBeInTheDocument();
	});

	it("renders children instead of the empty state when supplied", () => {
		const { getByText, queryByText } = renderWithProviders(
			<BaseBookTable columns={[{ key: "title", sortable: false }]} rows={[]}>
				<tr>
					<td>Injected row</td>
				</tr>
			</BaseBookTable>,
		);

		expect(getByText("Injected row")).toBeInTheDocument();
		expect(queryByText("No items found.")).toBeNull();
	});
});
