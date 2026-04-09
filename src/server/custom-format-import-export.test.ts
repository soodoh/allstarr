import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	all: vi.fn(),
	get: vi.fn(),
	run: vi.fn(),
	where: vi.fn(),
	requireAuth: vi.fn(),
	requireAdmin: vi.fn(),
	invalidateCFCache: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.all,
				where: vi.fn(() => ({
					all: mocks.all,
					get: mocks.get,
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				run: mocks.run,
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: mocks.run,
				})),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	customFormats: {
		id: "customFormats.id",
		name: "customFormats.name",
	},
}));

vi.mock("./middleware", () => ({
	requireAuth: mocks.requireAuth,
	requireAdmin: mocks.requireAdmin,
}));

vi.mock("./indexers/cf-scoring", () => ({
	invalidateCFCache: mocks.invalidateCFCache,
}));

const sampleFormat = {
	name: "HD Bluray",
	category: "Resolution",
	specifications: [
		{
			name: "source",
			type: "string",
			value: "bluray",
			negate: false,
			required: true,
		},
	],
	defaultScore: 100,
	contentTypes: ["movie"],
	includeInRenaming: false,
	description: "HD Bluray source",
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("exportCustomFormatsFn", () => {
	it("exports all custom formats when ids is empty", async () => {
		const dbRow = {
			id: 1,
			...sampleFormat,
			origin: "builtin",
			userModified: false,
		};
		mocks.all.mockReturnValueOnce([dbRow]);

		const { exportCustomFormatsFn } = await import(
			"./custom-format-import-export"
		);
		const result = await exportCustomFormatsFn({
			data: { customFormatIds: [] },
		});

		expect(result.version).toBe(1);
		expect(result.exportedAt).toBeDefined();
		expect(result.customFormats).toEqual([sampleFormat]);
		expect(mocks.requireAuth).toHaveBeenCalled();
	});

	it("exports filtered custom formats when ids are given", async () => {
		const dbRow = {
			id: 2,
			...sampleFormat,
			name: "4K",
			origin: "imported",
			userModified: true,
		};
		mocks.all.mockReturnValueOnce([dbRow]);

		const { exportCustomFormatsFn } = await import(
			"./custom-format-import-export"
		);
		const result = await exportCustomFormatsFn({
			data: { customFormatIds: [2] },
		});

		expect(result.customFormats).toHaveLength(1);
		expect(result.customFormats[0].name).toBe("4K");
	});
});

describe("importCustomFormatsFn", () => {
	it("skip mode skips existing formats", async () => {
		mocks.get.mockReturnValueOnce({ id: 1, name: "HD Bluray" });

		const { importCustomFormatsFn } = await import(
			"./custom-format-import-export"
		);
		const result = await importCustomFormatsFn({
			data: { customFormats: [sampleFormat], mode: "skip" },
		});

		expect(result).toEqual({ imported: 0, skipped: 1 });
		expect(mocks.run).not.toHaveBeenCalled();
		expect(mocks.requireAdmin).toHaveBeenCalled();
	});

	it("overwrite mode updates existing formats", async () => {
		mocks.get.mockReturnValueOnce({ id: 5, name: "HD Bluray" });

		const { importCustomFormatsFn } = await import(
			"./custom-format-import-export"
		);
		const result = await importCustomFormatsFn({
			data: { customFormats: [sampleFormat], mode: "overwrite" },
		});

		expect(result).toEqual({ imported: 1, skipped: 0 });
		expect(mocks.run).toHaveBeenCalledTimes(1);
	});

	it("copy mode creates a renamed copy of existing formats", async () => {
		mocks.get.mockReturnValueOnce({ id: 3, name: "HD Bluray" });

		const { importCustomFormatsFn } = await import(
			"./custom-format-import-export"
		);
		const result = await importCustomFormatsFn({
			data: { customFormats: [sampleFormat], mode: "copy" },
		});

		expect(result).toEqual({ imported: 1, skipped: 0 });
		expect(mocks.run).toHaveBeenCalledTimes(1);
	});

	it("creates new format when no existing match", async () => {
		mocks.get.mockReturnValueOnce(undefined);

		const { importCustomFormatsFn } = await import(
			"./custom-format-import-export"
		);
		const result = await importCustomFormatsFn({
			data: { customFormats: [sampleFormat], mode: "skip" },
		});

		expect(result).toEqual({ imported: 1, skipped: 0 });
		expect(mocks.run).toHaveBeenCalledTimes(1);
	});

	it("calls invalidateCFCache after import", async () => {
		mocks.get.mockReturnValueOnce(undefined);

		const { importCustomFormatsFn } = await import(
			"./custom-format-import-export"
		);
		await importCustomFormatsFn({
			data: { customFormats: [sampleFormat], mode: "skip" },
		});

		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
	});
});
