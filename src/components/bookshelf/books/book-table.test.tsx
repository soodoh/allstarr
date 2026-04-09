import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const bookTableMocks = vi.hoisted(() => ({
	baseBookTableProps: null as {
		columns: Array<{ key: string; sortable?: boolean }>;
		renderLeadingCell?: (row: {
			bookId: number;
			key: string | number;
			title: string;
		}) => ReactNode;
		rows: Array<{
			bookId: number;
			key: string | number;
			title: string;
		}>;
		onRowClick?: (row: {
			bookId: number;
			key: string | number;
			title: string;
		}) => void;
	} | null,
	navigate: vi.fn(),
	useTableColumns: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => bookTableMocks.navigate,
}));

vi.mock("src/components/bookshelf/books/base-book-table", () => ({
	default: ({
		children,
		columns,
		onRowClick,
		renderLeadingCell,
		rows,
	}: {
		children?: ReactNode;
		columns: Array<{ key: string; sortable?: boolean }>;
		onRowClick?: (row: {
			bookId: number;
			key: string | number;
			title: string;
		}) => void;
		renderLeadingCell?: (row: {
			bookId: number;
			key: string | number;
			title: string;
		}) => ReactNode;
		rows: Array<{
			bookId: number;
			key: string | number;
			title: string;
		}>;
	}) => {
		bookTableMocks.baseBookTableProps = {
			columns,
			onRowClick,
			renderLeadingCell,
			rows,
		};

		return (
			<div data-testid="base-book-table">
				{rows.map((row) => (
					<section key={row.key} data-testid={`row-${row.bookId}`}>
						<button
							type="button"
							onClick={() => {
								onRowClick?.(row);
							}}
						>
							{`Open ${row.title}`}
						</button>
						<div data-testid={`leading-${row.bookId}`}>
							{renderLeadingCell?.(row)}
						</div>
					</section>
				))}
				{children}
			</div>
		);
	},
}));

vi.mock("src/components/shared/profile-toggle-icons", () => ({
	default: ({
		onToggle,
		profiles,
	}: {
		onToggle: (profileId: number) => void;
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div>
			{profiles.map((profile) => (
				<button
					key={profile.id}
					onClick={(event) => {
						event.stopPropagation();
						onToggle(profile.id);
					}}
					type="button"
				>
					{profile.name}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/hooks/use-table-columns", () => ({
	useTableColumns: (...args: unknown[]) =>
		bookTableMocks.useTableColumns(...args),
}));

import BookTable from "./book-table";

const books = [
	{
		authorDownloadProfileIds: [8, 9],
		authorName: "Alice Author",
		bookAuthors: [],
		coverUrl: "/specimen.jpg",
		downloadProfileIds: [8],
		id: 10,
		rating: 4.5,
		ratingsCount: 321,
		releaseDate: "2024-01-01",
		series: [{ position: "2", title: "Series A" }],
		title: "Specimen",
		usersCount: 55,
	},
	{
		authorDownloadProfileIds: [],
		authorName: "Bob Writer",
		bookAuthors: [],
		coverUrl: null,
		downloadProfileIds: [],
		id: 11,
		rating: null,
		ratingsCount: null,
		releaseDate: null,
		series: [],
		title: "No Filters",
		usersCount: null,
	},
];

const visibleColumns = [
	{ key: "monitored", label: "Monitored" },
	{ key: "cover", label: "Cover" },
	{ key: "title", label: "Title" },
	{ key: "author", label: "Author" },
	{ key: "releaseDate", label: "Release Date" },
	{ key: "readers", label: "Readers" },
	{ key: "rating", label: "Rating" },
	{ key: "series", label: "Series" },
	{ key: "custom", label: "Custom Label" },
];

describe("BookTable", () => {
	beforeEach(() => {
		bookTableMocks.baseBookTableProps = null;
		bookTableMocks.navigate.mockReset();
		bookTableMocks.useTableColumns.mockReturnValue({ visibleColumns });
	});

	it("maps rows, filters author-linked profiles, and navigates on row clicks", async () => {
		const onToggleProfile = vi.fn();
		await renderWithProviders(
			<BookTable
				books={books}
				downloadProfiles={[
					{ icon: "film", id: 8, name: "4K" },
					{ icon: "film", id: 9, name: "HD" },
					{ icon: "film", id: 10, name: "SD" },
				]}
				onToggleProfile={onToggleProfile}
			/>,
		);

		expect(bookTableMocks.baseBookTableProps?.columns).toEqual([
			{ key: "monitored", sortable: false },
			{ key: "cover", sortable: false },
			{ key: "title", sortable: true },
			{ key: "author", sortable: true },
			{ key: "releaseDate", sortable: true },
			{ key: "readers", sortable: true },
			{ key: "rating", sortable: true },
			{ key: "series", sortable: true },
			{ key: "custom", sortable: false },
		]);
		expect(bookTableMocks.baseBookTableProps?.rows[0]).toMatchObject({
			bookId: 10,
			downloadProfileIds: [8],
			monitored: true,
			title: "Specimen",
		});
		expect(bookTableMocks.baseBookTableProps?.rows[1]).toMatchObject({
			bookId: 11,
			downloadProfileIds: [],
			monitored: false,
			title: "No Filters",
		});

		await expect
			.element(page.getByTestId("leading-10"))
			.toHaveTextContent("4K");
		await expect
			.element(page.getByTestId("leading-10"))
			.toHaveTextContent("HD");
		await expect
			.element(page.getByTestId("leading-10"))
			.not.toHaveTextContent("SD");
		await expect
			.element(page.getByTestId("leading-11"))
			.toHaveTextContent("4K");
		await expect
			.element(page.getByTestId("leading-11"))
			.toHaveTextContent("HD");
		await expect
			.element(page.getByTestId("leading-11"))
			.toHaveTextContent("SD");

		// Click the 4K button within leading-10
		const leading10 = await page.getByTestId("leading-10").element();
		const btn4K = leading10.querySelector("button") as HTMLButtonElement;
		await btn4K.click();
		expect(onToggleProfile).toHaveBeenCalledWith(10, 8);

		await page.getByRole("button", { name: "Open Specimen" }).click();
		expect(bookTableMocks.navigate).toHaveBeenCalledWith({
			params: { bookId: "10" },
			to: "/books/$bookId",
		});
	});

	it("omits leading profile controls when no profile toggles are provided", async () => {
		await renderWithProviders(<BookTable books={books} />);

		expect(
			bookTableMocks.baseBookTableProps?.renderLeadingCell,
		).toBeUndefined();
		expect(bookTableMocks.baseBookTableProps?.rows).toHaveLength(2);
	});
});
