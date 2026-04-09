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
	indexers: {
		id: "indexers.id",
		enableAutomaticSearch: "indexers.enableAutomaticSearch",
	},
	syncedIndexers: {
		id: "syncedIndexers.id",
		enableAutomaticSearch: "syncedIndexers.enableAutomaticSearch",
	},
}));
vi.mock("src/server/auto-search", () => ({
	runAutoSearch: mocks.runAutoSearch,
}));
vi.mock("../../indexer-rate-limiter", () => ({
	anyIndexerAvailable: mocks.anyIndexerAvailable,
}));
vi.mock("../registry", () => ({ registerTask: mocks.registerTask }));

import "./search-missing";

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

describe("search-missing task", () => {
	const updateProgress = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.db.select.mockReturnThis();
		mocks.db.from.mockReturnThis();
		mocks.db.where.mockReturnThis();
		mocks.db.all.mockReturnValue([]);
	});

	it("registers with correct metadata", () => {
		const def = taskDef;
		expect(def.id).toBe("search-missing");
		expect(def.name).toBe("Search for Missing");
		expect(def.group).toBe("search");
		expect(def.defaultInterval).toBe(24 * 60 * 60);
	});

	it("returns early when no search-enabled indexers configured", async () => {
		// Both queries return empty arrays
		mocks.db.all.mockReturnValueOnce([]).mockReturnValueOnce([]);

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "No search-enabled indexers configured",
		});
		expect(mocks.anyIndexerAvailable).not.toHaveBeenCalled();
		expect(mocks.runAutoSearch).not.toHaveBeenCalled();
	});

	it("skips when all indexers are in backoff", async () => {
		mocks.db.all
			.mockReturnValueOnce([{ id: 10 }])
			.mockReturnValueOnce([{ id: 20 }]);
		mocks.anyIndexerAvailable.mockReturnValue(false);

		const result = await handler(updateProgress);

		expect(mocks.anyIndexerAvailable).toHaveBeenCalledWith([10], [20]);
		expect(result).toEqual({
			success: true,
			message: "All indexers in backoff or exhausted, skipping cycle",
		});
		expect(mocks.runAutoSearch).not.toHaveBeenCalled();
	});

	it("calls updateProgress before searching", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 0,
			grabbed: 0,
			errors: 0,
			details: [],
		});

		await handler(updateProgress);

		expect(updateProgress).toHaveBeenCalledWith(
			"Searching for wanted items...",
		);
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

	it("builds summary with various content types", async () => {
		mocks.db.all
			.mockReturnValueOnce([{ id: 1 }])
			.mockReturnValueOnce([{ id: 2 }]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 6,
			grabbed: 3,
			errors: 0,
			details: [{ searched: true }, { searched: true }],
			movieDetails: [{ searched: true }],
			episodeDetails: [
				{ searched: true },
				{ searched: true },
				{ searched: true },
			],
		});

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "Searched 2 books, 1 movie, 3 episodes — 3 releases grabbed",
		});
	});

	it("includes errors in summary and sets success false", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 2,
			grabbed: 0,
			errors: 2,
			details: [{ searched: true }, { searched: true }],
		});

		const result = await handler(updateProgress);

		expect(result.success).toBe(false);
		expect(result.message).toBe("Searched 2 books — 2 errors");
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

	it("falls back to generic item count when no typed details match", async () => {
		mocks.db.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 7,
			grabbed: 0,
			errors: 0,
			details: [],
			movieDetails: [],
			episodeDetails: [],
		});

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "Searched 7 items",
		});
	});

	it("proceeds when only synced indexers are enabled", async () => {
		mocks.db.all
			.mockReturnValueOnce([]) // no manual indexers
			.mockReturnValueOnce([{ id: 5 }]); // synced indexer
		mocks.anyIndexerAvailable.mockReturnValue(true);
		mocks.runAutoSearch.mockResolvedValue({
			searched: 1,
			grabbed: 0,
			errors: 0,
			details: [{ searched: true }],
		});

		const result = await handler(updateProgress);

		expect(mocks.anyIndexerAvailable).toHaveBeenCalledWith([], [5]);
		expect(result).toEqual({
			success: true,
			message: "Searched 1 book",
		});
	});
});
