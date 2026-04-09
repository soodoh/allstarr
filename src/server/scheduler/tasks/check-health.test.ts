import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	getRootFolderPaths: vi.fn(),
	selectAll: vi.fn(),
	accessSync: vi.fn(),
	constants: { R_OK: 4, W_OK: 2 },
}));

vi.mock("../registry", () => ({
	registerTask: mocks.registerTask,
}));

vi.mock("src/server/root-folders", () => ({
	getRootFolderPaths: mocks.getRootFolderPaths,
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.selectAll,
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	indexers: "indexers",
	syncedIndexers: "syncedIndexers",
	downloadClients: "downloadClients",
}));

vi.mock("node:fs", () => ({
	accessSync: mocks.accessSync,
	constants: mocks.constants,
}));

// Import triggers registerTask side effect
import "./check-health";

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

beforeEach(() => {
	vi.clearAllMocks();
	delete process.env.HARDCOVER_TOKEN;
});

describe("check-health task", () => {
	it("registers with correct metadata", () => {
		expect(taskDef).toBeDefined();
		expect(taskDef.id).toBe("check-health");
		expect(taskDef.name).toBe("Check Health");
		expect(taskDef.group).toBe("maintenance");
		expect(taskDef.defaultInterval).toBe(25 * 60);
	});

	it("reports all healthy when everything is configured", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/movies", "/tv"]);
		mocks.accessSync.mockReturnValue(undefined);
		// indexers call, syncedIndexers call, downloadClients call
		mocks.selectAll
			.mockReturnValueOnce([{ id: 1 }]) // indexers
			.mockReturnValueOnce([]) // syncedIndexers
			.mockReturnValueOnce([{ id: 1 }]); // downloadClients
		process.env.HARDCOVER_TOKEN = "test-token";

		const result = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toBe("All systems healthy");
	});

	it("counts issue when no root folders exist", async () => {
		mocks.getRootFolderPaths.mockReturnValue([]);
		mocks.selectAll
			.mockReturnValueOnce([{ id: 1 }]) // indexers
			.mockReturnValueOnce([]) // syncedIndexers
			.mockReturnValueOnce([{ id: 1 }]); // downloadClients
		process.env.HARDCOVER_TOKEN = "test-token";

		const result = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toBe("Found 1 health issue(s)");
	});

	it("counts issue for each inaccessible root folder", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/movies", "/tv", "/music"]);
		mocks.accessSync
			.mockReturnValueOnce(undefined) // /movies OK
			.mockImplementationOnce(() => {
				throw new Error("EACCES");
			}) // /tv fails
			.mockImplementationOnce(() => {
				throw new Error("EACCES");
			}); // /music fails
		mocks.selectAll
			.mockReturnValueOnce([{ id: 1 }]) // indexers
			.mockReturnValueOnce([]) // syncedIndexers
			.mockReturnValueOnce([{ id: 1 }]); // downloadClients
		process.env.HARDCOVER_TOKEN = "test-token";

		const result = await handler(vi.fn());

		expect(result.message).toBe("Found 2 health issue(s)");
	});

	it("counts issue when no indexers or synced indexers exist", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/movies"]);
		mocks.accessSync.mockReturnValue(undefined);
		mocks.selectAll
			.mockReturnValueOnce([]) // indexers - empty
			.mockReturnValueOnce([]) // syncedIndexers - empty
			.mockReturnValueOnce([{ id: 1 }]); // downloadClients
		process.env.HARDCOVER_TOKEN = "test-token";

		const result = await handler(vi.fn());

		expect(result.message).toBe("Found 1 health issue(s)");
	});

	it("does not count issue when synced indexers exist but regular indexers do not", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/movies"]);
		mocks.accessSync.mockReturnValue(undefined);
		mocks.selectAll
			.mockReturnValueOnce([]) // indexers - empty
			.mockReturnValueOnce([{ id: 1 }]) // syncedIndexers - has one
			.mockReturnValueOnce([{ id: 1 }]); // downloadClients
		process.env.HARDCOVER_TOKEN = "test-token";

		const result = await handler(vi.fn());

		expect(result.message).toBe("All systems healthy");
	});

	it("counts issue when no download clients exist", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/movies"]);
		mocks.accessSync.mockReturnValue(undefined);
		mocks.selectAll
			.mockReturnValueOnce([{ id: 1 }]) // indexers
			.mockReturnValueOnce([]) // syncedIndexers
			.mockReturnValueOnce([]); // downloadClients - empty
		process.env.HARDCOVER_TOKEN = "test-token";

		const result = await handler(vi.fn());

		expect(result.message).toBe("Found 1 health issue(s)");
	});

	it("counts issue when HARDCOVER_TOKEN is missing", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/movies"]);
		mocks.accessSync.mockReturnValue(undefined);
		mocks.selectAll
			.mockReturnValueOnce([{ id: 1 }]) // indexers
			.mockReturnValueOnce([]) // syncedIndexers
			.mockReturnValueOnce([{ id: 1 }]); // downloadClients
		// HARDCOVER_TOKEN not set

		const result = await handler(vi.fn());

		expect(result.message).toBe("Found 1 health issue(s)");
	});

	it("accumulates multiple issues", async () => {
		mocks.getRootFolderPaths.mockReturnValue([]); // +1
		mocks.selectAll
			.mockReturnValueOnce([]) // indexers empty
			.mockReturnValueOnce([]) // syncedIndexers empty (+1)
			.mockReturnValueOnce([]); // downloadClients empty (+1)
		// HARDCOVER_TOKEN not set (+1)

		const result = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toBe("Found 4 health issue(s)");
	});
});
