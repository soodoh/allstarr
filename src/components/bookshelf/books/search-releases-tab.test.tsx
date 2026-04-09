import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const searchReleasesTabMocks = vi.hoisted(() => ({
	grabRelease: {
		isPending: false,
		mutate: vi.fn(),
		variables: undefined as { guid: string } | undefined,
	},
	searchIndexers: {
		data: undefined as
			| { releases: Array<{ guid: string; title: string }> }
			| undefined,
		isPending: false,
		mutate: vi.fn(),
	},
	useQuery: vi.fn(),
	useQueryClient: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			searchReleasesTabMocks.useQuery(...args),
		useQueryClient: () => searchReleasesTabMocks.useQueryClient(),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		onClick,
		to,
	}: PropsWithChildren<{
		className?: string;
		onClick?: () => void;
		to: string;
	}>) => (
		<a className={className} href={to} onClick={onClick}>
			{children}
		</a>
	),
}));

vi.mock("sonner", () => ({
	toast: {
		success: (...args: unknown[]) =>
			searchReleasesTabMocks.toastSuccess(...args),
	},
}));

vi.mock("src/hooks/mutations", () => ({
	useGrabRelease: () => searchReleasesTabMocks.grabRelease,
	useSearchIndexers: () => searchReleasesTabMocks.searchIndexers,
}));

vi.mock("src/components/bookshelf/books/search-toolbar", () => ({
	default: ({
		defaultQuery,
		disabled,
		onSearch,
		searching,
	}: {
		defaultQuery: string;
		disabled?: boolean;
		onSearch: (query: string) => void;
		searching: boolean;
	}) => (
		<div data-testid="search-toolbar">
			<span>default:{defaultQuery}</span>
			<span>searching:{searching ? "yes" : "no"}</span>
			<span>disabled:{disabled ? "yes" : "no"}</span>
			<button onClick={() => onSearch("Manual Query")} type="button">
				Trigger search
			</button>
		</div>
	),
}));

vi.mock("src/components/bookshelf/books/release-table", () => ({
	default: ({
		grabbingGuid,
		loading,
		onGrab,
		releases,
		statusMap,
	}: {
		grabbingGuid: string | undefined;
		loading?: boolean;
		onGrab: (release: { guid: string; title: string }) => void;
		releases: Array<{ guid: string; title: string }>;
		statusMap: unknown;
	}) => (
		<div data-testid="release-table">
			<div>loading:{loading ? "yes" : "no"}</div>
			<div>grabbing:{grabbingGuid ?? "none"}</div>
			<div>status:{statusMap ? "yes" : "no"}</div>
			<div>releases:{releases.map((release) => release.title).join(",")}</div>
			<button onClick={() => onGrab(releases[0])} type="button">
				Grab first
			</button>
		</div>
	),
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({
		children,
		value,
	}: {
		children: React.ReactNode;
		value: string;
	}) => <section data-value={value}>{children}</section>,
}));

import SearchReleasesTab from "./search-releases-tab";

describe("SearchReleasesTab", () => {
	afterEach(() => {
		searchReleasesTabMocks.grabRelease.isPending = false;
		searchReleasesTabMocks.grabRelease.mutate.mockReset();
		searchReleasesTabMocks.grabRelease.variables = undefined;
		searchReleasesTabMocks.searchIndexers.data = undefined;
		searchReleasesTabMocks.searchIndexers.isPending = false;
		searchReleasesTabMocks.searchIndexers.mutate.mockReset();
		searchReleasesTabMocks.useQuery.mockReset();
		searchReleasesTabMocks.useQueryClient.mockReset();
		searchReleasesTabMocks.toastSuccess.mockReset();
	});

	it("shows the no-indexers message and navigates to settings", async () => {
		const user = userEvent.setup();
		const onNavigateAway = vi.fn();
		searchReleasesTabMocks.useQuery.mockReturnValue({ data: null });

		const { getByRole, getByText } = renderWithProviders(
			<SearchReleasesTab
				book={{ authorName: "Leigh Bardugo", id: 7, title: "Ninth House" }}
				enabled
				hasIndexers={false}
				onNavigateAway={onNavigateAway}
			/>,
		);

		expect(getByText("No indexers configured or enabled.")).toBeInTheDocument();
		await user.click(getByRole("link", { name: "Settings" }));
		expect(onNavigateAway).toHaveBeenCalled();
	});

	it("auto-searches when enabled, supports manual search, and grabs releases", async () => {
		const user = userEvent.setup();
		const invalidateQueries = vi.fn();
		searchReleasesTabMocks.useQueryClient.mockReturnValue({
			invalidateQueries,
		});
		searchReleasesTabMocks.searchIndexers.data = {
			releases: [
				{ guid: "release-1", title: "Release One" },
				{ guid: "release-2", title: "Release Two" },
			],
		};
		searchReleasesTabMocks.searchIndexers.mutate.mockClear();
		searchReleasesTabMocks.grabRelease.mutate.mockImplementation(
			(
				payload: unknown,
				options?: {
					onSuccess?: (result: { downloadClientName: string }) => void;
				},
			) => {
				options?.onSuccess?.({ downloadClientName: "qBittorrent" });
			},
		);
		searchReleasesTabMocks.useQuery.mockReturnValue({
			data: { grabbedGuids: [], queueTitles: [], existingQualityIds: [] },
		});

		const { getByRole, getByTestId, rerender } = renderWithProviders(
			<SearchReleasesTab
				book={{ authorName: "Frank Herbert", id: 12, title: "Dune" }}
				enabled
				hasIndexers
			/>,
		);

		expect(searchReleasesTabMocks.searchIndexers.mutate).toHaveBeenCalledWith({
			bookId: 12,
			categories: null,
			query: "Frank Herbert Dune",
		});
		expect(getByTestId("search-toolbar")).toHaveTextContent(
			"default:Frank Herbert Dune",
		);
		expect(getByTestId("release-table")).toHaveTextContent(
			"releases:Release One,Release Two",
		);

		await user.click(getByRole("button", { name: "Trigger search" }));
		expect(
			searchReleasesTabMocks.searchIndexers.mutate,
		).toHaveBeenLastCalledWith({
			bookId: 12,
			categories: null,
			query: "Manual Query",
		});

		await user.click(getByRole("button", { name: "Grab first" }));
		expect(searchReleasesTabMocks.grabRelease.mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				bookId: 12,
				guid: "release-1",
				title: "Release One",
			}),
			expect.any(Object),
		);
		expect(searchReleasesTabMocks.toastSuccess).toHaveBeenCalledWith(
			"Sent to qBittorrent",
		);
		expect(invalidateQueries).toHaveBeenCalled();

		rerender(
			<SearchReleasesTab
				book={{ authorName: "Frank Herbert", id: 12, title: "Dune" }}
				enabled={false}
				hasIndexers
			/>,
		);
		rerender(
			<SearchReleasesTab
				book={{ authorName: "Frank Herbert", id: 12, title: "Dune" }}
				enabled
				hasIndexers
			/>,
		);

		expect(searchReleasesTabMocks.searchIndexers.mutate).toHaveBeenCalledTimes(
			2,
		);
	});
});
