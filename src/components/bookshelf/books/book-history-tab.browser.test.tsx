import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const bookHistoryTabMocks = vi.hoisted(() => ({
	historyListQuery: vi.fn(),
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			bookHistoryTabMocks.useQuery(...args),
	};
});

vi.mock("src/lib/queries", () => ({
	historyListQuery: (params: unknown) => {
		bookHistoryTabMocks.historyListQuery(params);
		return {
			queryFn: vi.fn(),
			queryKey: ["history", "list", params],
		};
	},
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) => <section data-value={value}>{children}</section>,
}));

vi.mock("src/components/shared/table-pagination", () => ({
	default: ({
		onPageChange,
		onPageSizeChange,
		page: currentPage,
		pageSize,
		totalItems,
		totalPages,
	}: {
		onPageChange: (page: number) => void;
		onPageSizeChange: (size: number) => void;
		page: number;
		pageSize: number;
		totalItems: number;
		totalPages: number;
	}) => (
		<div data-testid="pagination">
			<div>
				page:{currentPage} size:{pageSize} total:{totalItems} pages:{totalPages}
			</div>
			<button onClick={() => onPageChange(currentPage + 1)} type="button">
				Next page
			</button>
			<button onClick={() => onPageSizeChange(10)} type="button">
				Page size 10
			</button>
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children, variant }: { children: ReactNode; variant: string }) => (
		<span data-variant={variant}>{children}</span>
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

import BookHistoryTab from "./book-history-tab";

describe("BookHistoryTab", () => {
	afterEach(() => {
		bookHistoryTabMocks.historyListQuery.mockReset();
		bookHistoryTabMocks.useQuery.mockReset();
	});

	it("shows a loading state while fetching history", async () => {
		bookHistoryTabMocks.useQuery.mockReturnValue({
			isLoading: true,
		});

		await renderWithProviders(<BookHistoryTab bookId={7} />);

		await expect
			.element(page.getByText("Loading history..."))
			.toBeInTheDocument();
		expect(bookHistoryTabMocks.historyListQuery).toHaveBeenCalledWith({
			bookId: 7,
			limit: 25,
			page: 1,
		});
	});

	it("renders events and refreshes the query params when pagination changes", async () => {
		bookHistoryTabMocks.useQuery.mockReturnValue({
			data: {
				items: [
					{
						authorId: null,
						authorName: null,
						bookId: 7,
						bookTitle: "The Archive",
						data: {
							downloadClientName: "qBittorrent",
							protocol: "torrent",
							size: 1024,
						},
						date: new Date("2025-03-01T12:00:00Z"),
						eventType: "bookGrabbed",
						id: 1,
					},
					{
						authorId: null,
						authorName: null,
						bookId: 7,
						bookTitle: "The Archive",
						data: {
							title: "The Archive",
							updated: true,
						},
						date: new Date("2025-03-02T12:00:00Z"),
						eventType: "bookUpdated",
						id: 2,
					},
				],
				page: 1,
				total: 2,
				totalPages: 4,
			},
			isLoading: false,
		});

		await renderWithProviders(<BookHistoryTab bookId={7} />);

		await expect
			.element(page.getByText("Grabbed"))
			.toHaveAttribute("data-variant", "outline");
		await expect
			.element(page.getByText("Book Updated"))
			.toHaveAttribute("data-variant", "secondary");
		await expect
			.element(page.getByText("Client: qBittorrent · Protocol: torrent · 1 KB"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("title: The Archive, updated: true"))
			.toBeInTheDocument();
		await expect.element(page.getByTestId("pagination")).toBeInTheDocument();

		await page.getByRole("button", { name: "Next page" }).click();
		expect(bookHistoryTabMocks.historyListQuery).toHaveBeenLastCalledWith({
			bookId: 7,
			limit: 25,
			page: 2,
		});

		await page.getByRole("button", { name: "Page size 10" }).click();
		expect(bookHistoryTabMocks.historyListQuery).toHaveBeenLastCalledWith({
			bookId: 7,
			limit: 10,
			page: 1,
		});
	});
});
