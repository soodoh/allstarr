import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
	all: vi.fn(),
	get: vi.fn(),
	run: vi.fn(),
	returning: vi.fn(),
	values: vi.fn(),
	set: vi.fn(),
	where: vi.fn(),
	from: vi.fn(),
	innerJoin: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	invalidateCFCache: vi.fn(),
	requireAdmin: vi.fn(),
	requireAuth: vi.fn(),
	createCustomFormatParse: vi.fn((d: unknown) => d),
	updateCustomFormatParse: vi.fn((d: unknown) => d),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
}));

vi.mock("src/db", () => {
	// Build a chainable DB mock where every method returns the chain
	const chain: Record<string, ReturnType<typeof vi.fn>> = {};
	for (const key of [
		"all",
		"get",
		"run",
		"returning",
		"values",
		"set",
		"where",
		"from",
		"innerJoin",
		"onConflictDoUpdate",
	]) {
		chain[key] = mocks[key as keyof typeof mocks] as ReturnType<typeof vi.fn>;
	}
	// Each method returns the chain by default
	for (const fn of Object.values(chain)) {
		(fn as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
	}

	return {
		db: {
			select: vi.fn(() => chain),
			insert: vi.fn(() => chain),
			update: vi.fn(() => chain),
			delete: vi.fn(() => chain),
		},
	};
});

vi.mock("src/db/schema", () => ({
	customFormats: {
		id: "customFormats.id",
		name: "customFormats.name",
		category: "customFormats.category",
		defaultScore: "customFormats.defaultScore",
		contentTypes: "customFormats.contentTypes",
		origin: "customFormats.origin",
	},
	profileCustomFormats: {
		id: "profileCustomFormats.id",
		profileId: "profileCustomFormats.profileId",
		customFormatId: "profileCustomFormats.customFormatId",
		score: "profileCustomFormats.score",
	},
}));

vi.mock("src/lib/validators", () => ({
	createCustomFormatSchema: { parse: mocks.createCustomFormatParse },
	updateCustomFormatSchema: { parse: mocks.updateCustomFormatParse },
}));

vi.mock("./indexers/cf-scoring", () => ({
	invalidateCFCache: mocks.invalidateCFCache,
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

import {
	addCategoryToProfileFn,
	bulkSetProfileCFScoresFn,
	createCustomFormatFn,
	deleteCustomFormatFn,
	duplicateCustomFormatFn,
	getCustomFormatsFn,
	getProfileCustomFormatsFn,
	removeProfileCFsFn,
	setProfileCFScoreFn,
	updateCustomFormatFn,
} from "./custom-formats";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();

	// Re-establish the default chain behavior after clearAllMocks
	const chain: Record<string, ReturnType<typeof vi.fn>> = {};
	for (const key of [
		"all",
		"get",
		"run",
		"returning",
		"values",
		"set",
		"where",
		"from",
		"innerJoin",
		"onConflictDoUpdate",
	]) {
		chain[key] = mocks[key as keyof typeof mocks] as ReturnType<typeof vi.fn>;
	}
	for (const fn of Object.values(chain)) {
		fn.mockImplementation(() => chain);
	}

	mocks.createCustomFormatParse.mockImplementation((d: unknown) => d);
	mocks.updateCustomFormatParse.mockImplementation((d: unknown) => d);
});

// ---------------------------------------------------------------------------
// getCustomFormatsFn
// ---------------------------------------------------------------------------

describe("getCustomFormatsFn", () => {
	it("requires auth and returns all custom formats", async () => {
		const rows = [
			{ id: 1, name: "TrueHD ATMOS" },
			{ id: 2, name: "DTS-HD MA" },
		];
		mocks.all.mockReturnValueOnce(rows);

		const result = await getCustomFormatsFn();

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(result).toEqual(rows);
	});
});

// ---------------------------------------------------------------------------
// createCustomFormatFn
// ---------------------------------------------------------------------------

describe("createCustomFormatFn", () => {
	it("requires admin and inserts with origin null and userModified false", async () => {
		const input = {
			name: "Test CF",
			category: "Audio Codec",
			specifications: [],
			defaultScore: 100,
			contentTypes: ["movie"],
			includeInRenaming: false,
			description: null,
		};
		const created = { id: 1, ...input, origin: null, userModified: false };
		mocks.get.mockReturnValueOnce(created);

		const result = await createCustomFormatFn({ data: input });

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.createCustomFormatParse).toHaveBeenCalledWith(input);
		expect(mocks.values).toHaveBeenCalledWith({
			...input,
			origin: null,
			userModified: false,
		});
		expect(result).toEqual(created);
	});
});

// ---------------------------------------------------------------------------
// updateCustomFormatFn
// ---------------------------------------------------------------------------

describe("updateCustomFormatFn", () => {
	it("updates a non-builtin CF without marking userModified", async () => {
		const input = { id: 5, name: "Renamed", category: "HDR" };
		mocks.get
			.mockReturnValueOnce({ origin: null }) // existing lookup
			.mockReturnValueOnce({ id: 5, name: "Renamed", category: "HDR" }); // update result

		const result = await updateCustomFormatFn({ data: input });

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.set).toHaveBeenCalledWith({
			name: "Renamed",
			category: "HDR",
		});
		expect(result).toEqual({ id: 5, name: "Renamed", category: "HDR" });
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
	});

	it("marks builtin CFs as user-modified", async () => {
		const input = { id: 3, name: "Modified Builtin", category: "Resolution" };
		mocks.get
			.mockReturnValueOnce({ origin: "builtin" }) // existing lookup
			.mockReturnValueOnce({
				id: 3,
				name: "Modified Builtin",
				userModified: true,
			}); // update result

		const result = await updateCustomFormatFn({ data: input });

		expect(mocks.set).toHaveBeenCalledWith({
			name: "Modified Builtin",
			category: "Resolution",
			userModified: true,
		});
		expect(result).toEqual({
			id: 3,
			name: "Modified Builtin",
			userModified: true,
		});
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// deleteCustomFormatFn
// ---------------------------------------------------------------------------

describe("deleteCustomFormatFn", () => {
	it("deletes by id, calls invalidateCFCache, and returns success", async () => {
		const result = await deleteCustomFormatFn({ data: { id: 7 } });

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.run).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ success: true });
	});
});

// ---------------------------------------------------------------------------
// duplicateCustomFormatFn
// ---------------------------------------------------------------------------

describe("duplicateCustomFormatFn", () => {
	it("duplicates a CF with (Copy) suffix, null origin, and userModified false", async () => {
		const source = {
			id: 10,
			name: "Original",
			category: "Audio Codec",
			specifications: [],
			defaultScore: 50,
			contentTypes: ["movie"],
			includeInRenaming: false,
			description: "test",
			origin: "builtin",
			userModified: true,
		};
		const duplicated = {
			id: 11,
			name: "Original (Copy)",
			category: "Audio Codec",
			specifications: [],
			defaultScore: 50,
			contentTypes: ["movie"],
			includeInRenaming: false,
			description: "test",
			origin: null,
			userModified: false,
		};
		mocks.get
			.mockReturnValueOnce(source) // source lookup
			.mockReturnValueOnce(duplicated); // insert result

		const result = await duplicateCustomFormatFn({ data: { id: 10 } });

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.values).toHaveBeenCalledWith({
			name: "Original (Copy)",
			category: "Audio Codec",
			specifications: [],
			defaultScore: 50,
			contentTypes: ["movie"],
			includeInRenaming: false,
			description: "test",
			origin: null,
			userModified: false,
		});
		expect(result).toEqual(duplicated);
	});

	it("throws when source custom format is not found", async () => {
		mocks.get.mockReturnValueOnce(undefined);

		await expect(
			duplicateCustomFormatFn({ data: { id: 999 } }),
		).rejects.toThrow("Custom format not found");
	});
});

// ---------------------------------------------------------------------------
// getProfileCustomFormatsFn
// ---------------------------------------------------------------------------

describe("getProfileCustomFormatsFn", () => {
	it("requires auth and returns joined profile CFs", async () => {
		const rows = [
			{
				id: 1,
				profileId: 5,
				customFormatId: 10,
				score: 100,
				name: "TrueHD",
				category: "Audio Codec",
				defaultScore: 100,
				contentTypes: ["movie"],
			},
		];
		mocks.all.mockReturnValueOnce(rows);

		const result = await getProfileCustomFormatsFn({
			data: { profileId: 5 },
		});

		expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(mocks.innerJoin).toHaveBeenCalledTimes(1);
		expect(result).toEqual(rows);
	});
});

// ---------------------------------------------------------------------------
// setProfileCFScoreFn
// ---------------------------------------------------------------------------

describe("setProfileCFScoreFn", () => {
	it("upserts a profile CF score and invalidates cache", async () => {
		const input = { profileId: 1, customFormatId: 10, score: 200 };
		const upserted = { id: 1, ...input };
		mocks.get.mockReturnValueOnce(upserted);

		const result = await setProfileCFScoreFn({ data: input });

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.values).toHaveBeenCalledWith({
			profileId: 1,
			customFormatId: 10,
			score: 200,
		});
		expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith({
			target: [
				"profileCustomFormats.profileId",
				"profileCustomFormats.customFormatId",
			],
			set: { score: 200 },
		});
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
		expect(result).toEqual(upserted);
	});
});

// ---------------------------------------------------------------------------
// bulkSetProfileCFScoresFn
// ---------------------------------------------------------------------------

describe("bulkSetProfileCFScoresFn", () => {
	it("deletes existing scores, inserts new ones, and invalidates cache", async () => {
		const input = {
			profileId: 2,
			scores: [
				{ customFormatId: 10, score: 100 },
				{ customFormatId: 20, score: 200 },
			],
		};
		const inserted = [
			{ id: 1, profileId: 2, customFormatId: 10, score: 100 },
			{ id: 2, profileId: 2, customFormatId: 20, score: 200 },
		];
		mocks.all.mockReturnValueOnce(inserted);

		const result = await bulkSetProfileCFScoresFn({ data: input });

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		// Should delete first then insert
		expect(mocks.run).toHaveBeenCalledTimes(1);
		expect(mocks.values).toHaveBeenCalledWith([
			{ profileId: 2, customFormatId: 10, score: 100 },
			{ profileId: 2, customFormatId: 20, score: 200 },
		]);
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
		expect(result).toEqual(inserted);
	});

	it("returns empty array when scores is empty", async () => {
		const result = await bulkSetProfileCFScoresFn({
			data: { profileId: 2, scores: [] },
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.run).toHaveBeenCalledTimes(1); // delete still runs
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
		expect(result).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// removeProfileCFsFn
// ---------------------------------------------------------------------------

describe("removeProfileCFsFn", () => {
	it("removes CFs from a profile and invalidates cache", async () => {
		const result = await removeProfileCFsFn({
			data: { profileId: 1, customFormatIds: [10, 20] },
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.run).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ success: true });
	});

	it("short-circuits when customFormatIds is empty", async () => {
		const result = await removeProfileCFsFn({
			data: { profileId: 1, customFormatIds: [] },
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.run).not.toHaveBeenCalled();
		expect(mocks.invalidateCFCache).not.toHaveBeenCalled();
		expect(result).toEqual({ success: true });
	});
});

// ---------------------------------------------------------------------------
// addCategoryToProfileFn
// ---------------------------------------------------------------------------

describe("addCategoryToProfileFn", () => {
	it("inserts only CFs not already assigned to the profile", async () => {
		const cfsInCategory = [
			{ id: 10, defaultScore: 100 },
			{ id: 20, defaultScore: 200 },
			{ id: 30, defaultScore: 300 },
		];
		const alreadyAssigned = [{ customFormatId: 20 }];
		const inserted = [
			{ id: 1, profileId: 5, customFormatId: 10, score: 100 },
			{ id: 2, profileId: 5, customFormatId: 30, score: 300 },
		];

		mocks.all
			.mockReturnValueOnce(cfsInCategory) // CFs in category
			.mockReturnValueOnce(alreadyAssigned) // already assigned
			.mockReturnValueOnce(inserted); // insert result

		const result = await addCategoryToProfileFn({
			data: { profileId: 5, category: "Audio Codec" },
		});

		expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(mocks.values).toHaveBeenCalledWith([
			{ profileId: 5, customFormatId: 10, score: 100 },
			{ profileId: 5, customFormatId: 30, score: 300 },
		]);
		expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
		expect(result).toEqual(inserted);
	});

	it("returns empty array when no CFs exist in the category", async () => {
		mocks.all.mockReturnValueOnce([]);

		const result = await addCategoryToProfileFn({
			data: { profileId: 5, category: "Empty" },
		});

		expect(result).toEqual([]);
		expect(mocks.invalidateCFCache).not.toHaveBeenCalled();
	});

	it("returns empty array when all CFs are already assigned", async () => {
		const cfsInCategory = [
			{ id: 10, defaultScore: 100 },
			{ id: 20, defaultScore: 200 },
		];
		const alreadyAssigned = [{ customFormatId: 10 }, { customFormatId: 20 }];

		mocks.all
			.mockReturnValueOnce(cfsInCategory)
			.mockReturnValueOnce(alreadyAssigned);

		const result = await addCategoryToProfileFn({
			data: { profileId: 5, category: "Audio Codec" },
		});

		expect(result).toEqual([]);
		expect(mocks.invalidateCFCache).not.toHaveBeenCalled();
	});
});
