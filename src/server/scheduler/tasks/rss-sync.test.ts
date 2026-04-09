import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	eq: vi.fn(),
	db: {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		all: vi.fn(() => []),
	},
	runAutoSearch: vi.fn(),
	anyIndexerAvailable: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({ eq: mocks.eq }));
vi.mock("src/db", () => ({ db: mocks.db }));
vi.mock("src/db/schema", () => ({
	indexers: { id: "indexers.id", enableRss: "indexers.enableRss" },
	syncedIndexers: {
		id: "syncedIndexers.id",
		enableRss: "syncedIndexers.enableRss",
	},
}));
vi.mock("src/server/auto-search", () => ({
	runAutoSearch: mocks.runAutoSearch,
}));
vi.mock("../../indexer-rate-limiter", () => ({
	anyIndexerAvailable: mocks.anyIndexerAvailable,
}));
vi.mock("../registry", () => ({ registerTask: mocks.registerTask }));

// Import triggers module-level registerTask call
import "./rss-sync";

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

describe("rss-sync task", () => {
	const updateProgress = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.db.select.mockReturnThis();
		mocks.db.from.mockReturnThis();
		mocks.db.where.mockReturnThis();
		mocks.db.all.mockReturnValue([]);
	});

	it("registers with correct metadata", () => {
		expect(taskDef.id).toBe("rss-sync");
		expect(taskDef.name).toBe("RSS Sync");
		expect(taskDef.group).toBe("search");
		expect(taskDef.defaultInterval).toBe(15 * 60);
	});

	it("skips when all indexers are in backoff", async () => {
		mocks.db.all
			.mockReturnValueOnce([{ id: 1 }]) // manual indexers
			.mockReturnValueOnce([{ id: 2 }]); // synced indexers
		mocks.anyIndexerAvailable.mockReturnValue(false);

		const result = await handler(updateProgress);

		expect(mocks.anyIndexerAvailable).toHaveBeenCalledWith([1], [2]);
		expect(result).toEqual({
			success: true,
			message: "All indexers in backoff or exhausted, skipping cycle",
		});
		expect(mocks.runAutoSearch).not.toHaveBeenCalled();
	});

	it("returns no wanted items when searched is 0", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 0,
			grabbed: 0,
			errors: 0,
			details: [],
		});

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "No wanted items to search",
		});
	});

	it("builds summary with book grabs", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 3,
			grabbed: 2,
			errors: 0,
			details: [{ searched: true }, { searched: true }, { searched: true }],
		});

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "Searched 3 books — 2 releases grabbed",
		});
	});

	it("builds summary with multiple content types", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 5,
			grabbed: 1,
			errors: 0,
			details: [{ searched: true }, { searched: false }],
			movieDetails: [{ searched: true }, { searched: true }],
			episodeDetails: [{ searched: true }],
		});

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "Searched 1 book, 2 movies, 1 episode — 1 release grabbed",
		});
	});

	it("includes errors in summary and sets success false", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 2,
			grabbed: 1,
			errors: 3,
			details: [{ searched: true }, { searched: true }],
		});

		const result = await handler(updateProgress);

		expect(result.success).toBe(false);
		expect(result.message).toBe(
			"Searched 2 books — 1 release grabbed, 3 errors",
		);
	});

	it("uses singular form for single counts", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 1,
			grabbed: 1,
			errors: 1,
			details: [{ searched: true }],
		});

		const result = await handler(updateProgress);

		expect(result.message).toBe("Searched 1 book — 1 release grabbed, 1 error");
	});

	it("falls back to generic item count when no typed details", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 4,
			grabbed: 0,
			errors: 0,
			details: [], // no details with searched: true
		});

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "Searched 4 items",
		});
	});
});
