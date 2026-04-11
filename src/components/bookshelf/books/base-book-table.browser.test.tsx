import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
	}) => <img alt={alt} data-type={type} src={src ?? undefined} />,
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
		const onRowClick = vi.fn();
		const onSort = vi.fn();
		const renderLeadingCell = vi.fn((row) => (
			<span>{`leading:${row.bookId}`}</span>
		));

		await renderWithProviders(
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

		await expect
			.element(page.getByText("Dune", { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Unknown Book")).toBeInTheDocument();
		await expect
			.element(page.getByText("Frank Herbert:99"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Solo Author")).toBeInTheDocument();
		await expect.element(page.getByText("2024-02-01")).toBeInTheDocument();
		expect(await page.getByTestId("additional-authors").all()).toHaveLength(2);
		await expect.element(page.getByText("5,600")).toBeInTheDocument();
		await expect.element(page.getByText("4.5")).toBeInTheDocument();
		await expect.element(page.getByText("(1,200)")).toBeInTheDocument();
		await expect.element(page.getByText("Audiobook")).toBeInTheDocument();
		await expect.element(page.getByText("1h 15m")).toBeInTheDocument();
		await expect.element(page.getByText("320")).toBeInTheDocument();
		await expect.element(page.getByText("1234567890")).toBeInTheDocument();
		await expect.element(page.getByText("9781234567897")).toBeInTheDocument();
		await expect.element(page.getByText("B00TEST")).toBeInTheDocument();
		await expect.element(page.getByText("98")).toBeInTheDocument();
		await expect.element(page.getByText("Ace")).toBeInTheDocument();
		await expect
			.element(page.getByText("Anniversary edition"))
			.toBeInTheDocument();
		await expect.element(page.getByText("English")).toBeInTheDocument();
		await expect.element(page.getByText("US")).toBeInTheDocument();
		await expect.element(page.getByText("Dune (#1)")).toBeInTheDocument();
		await expect
			.element(page.getByText("Unknown", { exact: true }))
			.toBeInTheDocument();
		expect((await page.getByText("—").all()).length).toBeGreaterThan(0);
		await expect
			.element(page.getByRole("img", { name: "Dune" }))
			.toHaveAttribute("src", "https://covers.example/dune.jpg");
		expect(renderLeadingCell).toHaveBeenCalledTimes(2);
		await expect.element(page.getByText("leading:10")).toBeInTheDocument();
		await expect.element(page.getByText("leading:11")).toBeInTheDocument();
		await expect.element(page.getByText("ChevronUp")).toBeInTheDocument();
		expect(
			(await page.getByText("ChevronsUpDown").all()).length,
		).toBeGreaterThan(0);

		await page.getByRole("columnheader", { name: /Title/i }).click();
		expect(onSort).toHaveBeenCalledWith("title");

		const unknownRow = await page
			.getByRole("row", { name: /Unknown Book/i })
			.element();
		if (unknownRow instanceof HTMLElement) {
			unknownRow.click();
		}
		expect(onRowClick).toHaveBeenCalledWith(rows[1]);
		await expect
			.element(page.getByRole("row", { name: /Dune/i }))
			.toHaveClass("bg-primary/10");
	});

	it("renders the custom empty message when no rows are present", async () => {
		await renderWithProviders(
			<BaseBookTable
				columns={[{ key: "title", sortable: false }]}
				emptyMessage="Nothing to display."
				rows={[]}
			/>,
		);

		await expect
			.element(page.getByText("Nothing to display."))
			.toBeInTheDocument();
	});

	it("renders children instead of the empty state when supplied", async () => {
		await renderWithProviders(
			<BaseBookTable columns={[{ key: "title", sortable: false }]} rows={[]}>
				<tr>
					<td>Injected row</td>
				</tr>
			</BaseBookTable>,
		);

		await expect.element(page.getByText("Injected row")).toBeInTheDocument();
		await expect
			.element(page.getByText("No items found."))
			.not.toBeInTheDocument();
	});
});
