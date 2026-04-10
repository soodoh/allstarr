import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const historyTabMocks = vi.hoisted(() => ({
	historyListQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			historyTabMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		params,
		to,
	}: {
		children: React.ReactNode;
		className?: string;
		params?: Record<string, string>;
		to: string;
	}) => (
		<a className={className} data-params={JSON.stringify(params)} href={to}>
			{children}
		</a>
	),
}));

vi.mock("src/lib/queries", () => ({
	historyListQuery: (params: unknown) => {
		historyTabMocks.historyListQuery(params);
		return {
			queryFn: vi.fn(),
			queryKey: ["history", params],
		};
	},
}));

vi.mock("src/components/activity/content-type-filter", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (value: "all" | "books" | "movies" | "tv") => void;
		value: string;
	}) => (
		<div>
			<div>content:{value}</div>
			<button onClick={() => onChange("all")} type="button">
				All content
			</button>
			<button onClick={() => onChange("books")} type="button">
				Books content
			</button>
			<button onClick={() => onChange("tv")} type="button">
				TV content
			</button>
			<button onClick={() => onChange("movies")} type="button">
				Movies content
			</button>
			<button onClick={() => onChange("unexpected" as never)} type="button">
				Unexpected content
			</button>
		</div>
	),
}));

vi.mock("src/components/shared/table-pagination", () => ({
	default: ({
		onPageChange,
		onPageSizeChange,
		page,
		pageSize,
		totalItems,
		totalPages,
	}: {
		onPageChange: (page: number) => void;
		onPageSizeChange: (pageSize: number) => void;
		page: number;
		pageSize: number;
		totalItems: number;
		totalPages: number;
	}) => (
		<div>
			<div>
				pagination:{page}:{pageSize}:{totalItems}:{totalPages}
			</div>
			<button onClick={() => onPageChange(page + 1)} type="button">
				Next page
			</button>
			<button onClick={() => onPageSizeChange(10)} type="button">
				Page size 10
			</button>
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		variant,
	}: {
		children: React.ReactNode;
		variant: string;
	}) => <span data-variant={variant}>{children}</span>,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: React.ReactNode;
		onValueChange: (value: string) => void;
		value: string;
	}) => (
		<div>
			<div>event:{value}</div>
			<button onClick={() => onValueChange("all")} type="button">
				All events filter
			</button>
			<button onClick={() => onValueChange("bookGrabbed")} type="button">
				Grabbed filter
			</button>
			<button onClick={() => onValueChange("movieAdded")} type="button">
				Movie added filter
			</button>
			{children}
		</div>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({
		children,
		value,
	}: {
		children: React.ReactNode;
		value: string;
	}) => <div data-value={value}>{children}</div>,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<div>{placeholder}</div>
	),
}));

vi.mock("src/components/ui/table", () => ({
	Table: ({ children }: { children: React.ReactNode }) => (
		<table>{children}</table>
	),
	TableBody: ({ children }: { children: React.ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: { children: React.ReactNode }) => (
		<td>{children}</td>
	),
	TableHead: ({ children }: { children: React.ReactNode }) => (
		<th>{children}</th>
	),
	TableHeader: ({ children }: { children: React.ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({ children }: { children: React.ReactNode }) => (
		<tr>{children}</tr>
	),
}));

import HistoryTab from "./history-tab";

describe("HistoryTab", () => {
	afterEach(() => {
		historyTabMocks.historyListQuery.mockReset();
		historyTabMocks.useSuspenseQuery.mockReset();
	});

	it("shows an empty state and requests the default first page", async () => {
		historyTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [],
				total: 0,
				totalPages: 0,
			},
		});

		await renderWithProviders(<HistoryTab />);

		await expect
			.element(page.getByText("No history events found."))
			.toBeInTheDocument();
		expect(historyTabMocks.historyListQuery).toHaveBeenCalledWith({
			limit: 25,
			page: 1,
		});
	});

	it("renders history rows, helper fallbacks, and local content-type filters", async () => {
		historyTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [
					{
						authorId: 7,
						authorName: null,
						bookId: 11,
						bookTitle: null,
						data: {
							downloadClientName: "qBittorrent",
							protocol: "torrent",
							size: 1024,
						},
						date: "2025-01-01T00:00:00.000Z",
						eventType: "bookGrabbed",
						id: 1,
					},
					{
						authorId: null,
						authorName: null,
						bookId: null,
						bookTitle: null,
						data: { title: "Inception" },
						date: "2025-01-02T00:00:00.000Z",
						eventType: "movieAdded",
						id: 2,
					},
					{
						authorId: null,
						authorName: null,
						bookId: null,
						bookTitle: null,
						data: { showTitle: "Severance" },
						date: "2025-01-03T00:00:00.000Z",
						eventType: "showDeleted",
						id: 3,
					},
					{
						authorId: null,
						authorName: null,
						bookId: null,
						bookTitle: null,
						data: { title: "Pilot" },
						date: "2025-01-04T00:00:00.000Z",
						eventType: "episodeFileImported",
						id: 4,
					},
					{
						authorId: null,
						authorName: null,
						bookId: null,
						bookTitle: null,
						data: { flag: true },
						date: "2025-01-05T00:00:00.000Z",
						eventType: "miscEvent",
						id: 5,
					},
					{
						authorId: null,
						authorName: null,
						bookId: null,
						bookTitle: null,
						data: null,
						date: "2025-01-06T00:00:00.000Z",
						eventType: "authorUpdated",
						id: 6,
					},
				],
				total: 6,
				totalPages: 3,
			},
		});

		await renderWithProviders(<HistoryTab />);

		await expect
			.element(page.getByText("Client: qBittorrent · Protocol: torrent · 1 KB"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Author #7")).toBeInTheDocument();
		await expect.element(page.getByText("Book #11")).toBeInTheDocument();
		await expect
			.element(page.getByText("Inception", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Severance", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Pilot", { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText("miscEvent")).toBeInTheDocument();
		await expect.element(page.getByText("flag: true")).toBeInTheDocument();
		await expect
			.element(page.getByText("pagination:1:25:6:3"))
			.toBeInTheDocument();

		await page.getByText("Books content").click();
		await expect
			.element(page.getByText("Inception", { exact: true }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText("Book #11")).toBeInTheDocument();

		await page.getByText("Movies content").click();
		await expect.element(page.getByText("Book #11")).not.toBeInTheDocument();
		await expect
			.element(page.getByText("Inception", { exact: true }))
			.toBeInTheDocument();

		await page.getByText("TV content").click();
		await expect
			.element(page.getByText("Severance", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Pilot", { exact: true }))
			.toBeInTheDocument();

		await page.getByText("Unexpected content").click();
		await expect.element(page.getByText("Book #11")).toBeInTheDocument();
		await expect
			.element(page.getByText("Inception", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Severance", { exact: true }))
			.toBeInTheDocument();
	});

	it("updates query params for event filters and pagination controls", async () => {
		historyTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [
					{
						authorId: null,
						authorName: null,
						bookId: 11,
						bookTitle: "Dune",
						data: {
							downloadClientName: "SABnzbd",
							protocol: "usenet",
							size: 2048,
						},
						date: "2025-02-01T00:00:00.000Z",
						eventType: "bookGrabbed",
						id: 10,
					},
				],
				total: 1,
				totalPages: 4,
			},
		});

		await renderWithProviders(<HistoryTab />);

		await page.getByText("Grabbed filter").click();
		expect(historyTabMocks.historyListQuery).toHaveBeenLastCalledWith({
			eventType: "bookGrabbed",
			limit: 25,
			page: 1,
		});

		await page.getByText("Next page").click();
		expect(historyTabMocks.historyListQuery).toHaveBeenLastCalledWith({
			eventType: "bookGrabbed",
			limit: 25,
			page: 2,
		});

		await page.getByText("Page size 10").click();
		expect(historyTabMocks.historyListQuery).toHaveBeenLastCalledWith({
			eventType: "bookGrabbed",
			limit: 10,
			page: 1,
		});

		await page.getByText("All events filter").click();
		expect(historyTabMocks.historyListQuery).toHaveBeenLastCalledWith({
			limit: 10,
			page: 1,
		});
	});

	it("falls back when show titles and grabbed details are missing", async () => {
		historyTabMocks.useSuspenseQuery.mockReturnValue({
			data: {
				items: [
					{
						authorId: null,
						authorName: null,
						bookId: null,
						bookTitle: null,
						data: {},
						date: "2025-03-01T00:00:00.000Z",
						eventType: "episodeFileDeleted",
						id: 20,
					},
					{
						authorId: null,
						authorName: null,
						bookId: null,
						bookTitle: null,
						data: {},
						date: "2025-03-02T00:00:00.000Z",
						eventType: "bookGrabbed",
						id: 21,
					},
				],
				total: 2,
				totalPages: 1,
			},
		});

		await renderWithProviders(<HistoryTab />);

		await expect
			.element(page.getByText("Client: qBittorrent"))
			.not.toBeInTheDocument();
	});
});
