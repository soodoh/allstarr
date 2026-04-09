import { describe, expect, it, vi } from "vitest";

const {
	useBulkRemoveFromBlocklist,
	useDeleteAuthor,
	useGrabRelease,
	useRemoveFromBlocklist,
	useRemoveFromQueue,
	useRefreshSeries,
	useSearchIndexers,
	useUpdateAuthor,
	useUpdateSeries,
} = vi.hoisted(() => ({
	useBulkRemoveFromBlocklist: vi.fn(),
	useDeleteAuthor: vi.fn(),
	useGrabRelease: vi.fn(),
	useRemoveFromBlocklist: vi.fn(),
	useRemoveFromQueue: vi.fn(),
	useRefreshSeries: vi.fn(),
	useSearchIndexers: vi.fn(),
	useUpdateAuthor: vi.fn(),
	useUpdateSeries: vi.fn(),
}));

vi.mock("./authors", () => ({
	useDeleteAuthor,
	useUpdateAuthor,
}));

vi.mock("./blocklist", () => ({
	useBulkRemoveFromBlocklist,
	useRemoveFromBlocklist,
}));

vi.mock("./books", () => ({}));
vi.mock("./download-clients", () => ({}));
vi.mock("./download-profiles", () => ({}));
vi.mock("./import", () => ({}));

vi.mock("./indexer-search", () => ({
	useGrabRelease,
	useSearchIndexers,
}));

vi.mock("./indexers", () => ({}));
vi.mock("./movies", () => ({}));

vi.mock("./queue", () => ({
	useRemoveFromQueue,
}));

vi.mock("./series", () => ({
	useRefreshSeries,
	useUpdateSeries,
}));

vi.mock("./settings", () => ({}));
vi.mock("./shows", () => ({}));

vi.mock("./user-settings", () => ({}));

import * as mutations from "./index";

describe("mutations barrel", () => {
	it("re-exports the targeted mutation hooks", () => {
		expect(mutations.useUpdateAuthor).toBe(useUpdateAuthor);
		expect(mutations.useDeleteAuthor).toBe(useDeleteAuthor);
		expect(mutations.useRemoveFromBlocklist).toBe(useRemoveFromBlocklist);
		expect(mutations.useBulkRemoveFromBlocklist).toBe(
			useBulkRemoveFromBlocklist,
		);
		expect(mutations.useSearchIndexers).toBe(useSearchIndexers);
		expect(mutations.useGrabRelease).toBe(useGrabRelease);
		expect(mutations.useRemoveFromQueue).toBe(useRemoveFromQueue);
		expect(mutations.useUpdateSeries).toBe(useUpdateSeries);
		expect(mutations.useRefreshSeries).toBe(useRefreshSeries);
	});
});
