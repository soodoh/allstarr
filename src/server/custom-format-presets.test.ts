import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateCFCache: vi.fn(),
	requireAdmin: vi.fn(),
	requireAuth: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	update: vi.fn(),
	deleteFn: vi.fn(),
	PRESETS: [
		{
			name: "HD Bluray + WEB",
			description: "Prefer high-quality Bluray and WEB releases",
			category: "Video - Movies",
			contentType: "movie",
			customFormats: [
				{
					name: "Bluray Tier 01",
					category: "Release Group",
					specifications: [
						{ name: "spec", type: "releaseGroup", value: "^FraMeSToR$" },
					],
					defaultScore: 0,
					contentTypes: ["movie"],
					description: "Top-tier Bluray groups",
				},
				{
					name: "WEB Tier 01",
					category: "Release Group",
					specifications: [
						{ name: "spec", type: "releaseGroup", value: "^FLUX$" },
					],
					defaultScore: 0,
					contentTypes: ["movie"],
					description: "Top-tier WEB groups",
				},
			],
			scores: { "Bluray Tier 01": 1800, "WEB Tier 01": 1700 },
			minCustomFormatScore: 0,
			upgradeUntilCustomFormatScore: 10000,
		},
		{
			name: "Lossless Audio",
			description: "Prefer lossless audio tracks",
			category: "Audio",
			contentType: "tv",
			customFormats: [
				{
					name: "FLAC",
					category: "Audio",
					specifications: [],
					defaultScore: 0,
					contentTypes: ["tv"],
					description: "FLAC audio",
				},
			],
			scores: { FLAC: 500 },
			minCustomFormatScore: 0,
			upgradeUntilCustomFormatScore: 5000,
		},
	] as unknown[],
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
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("src/lib/custom-format-preset-data", () => ({
	PRESETS: mocks.PRESETS,
}));

vi.mock("src/db", () => ({
	db: {
		select: (...args: unknown[]) => mocks.select(...args),
		insert: (...args: unknown[]) => mocks.insert(...args),
		update: (...args: unknown[]) => mocks.update(...args),
		delete: (...args: unknown[]) => mocks.deleteFn(...args),
	},
}));

vi.mock("src/db/schema", () => ({
	customFormats: { id: "customFormats.id", name: "customFormats.name" },
	downloadProfiles: { id: "downloadProfiles.id" },
	profileCustomFormats: { profileId: "profileCustomFormats.profileId" },
}));

vi.mock("./indexers/cf-scoring", () => ({
	invalidateCFCache: mocks.invalidateCFCache,
}));

vi.mock("./middleware", () => ({
	requireAdmin: () => mocks.requireAdmin(),
	requireAuth: () => mocks.requireAuth(),
}));

import { applyPresetFn, getPresetsFn } from "./custom-format-presets";

function createSelectChain(result: { get?: unknown }) {
	const chain = {
		from: vi.fn(() => chain),
		where: vi.fn(() => chain),
		get: vi.fn(() => result.get),
	};
	return chain;
}

function createInsertChain(result?: { get?: unknown }) {
	const chain = {
		values: vi.fn(() => chain),
		returning: vi.fn(() => chain),
		get: vi.fn(() => result?.get),
		run: vi.fn(),
	};
	return chain;
}

function createDeleteChain() {
	const chain = {
		where: vi.fn(() => chain),
		run: vi.fn(),
	};
	return chain;
}

function createUpdateChain() {
	const chain = {
		set: vi.fn(() => chain),
		where: vi.fn(() => chain),
		run: vi.fn(),
	};
	return chain;
}

describe("custom-format-presets", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuth.mockResolvedValue(undefined);
		mocks.requireAdmin.mockResolvedValue(undefined);
	});

	describe("getPresetsFn", () => {
		it("returns all presets when no contentType filter", async () => {
			const result = await getPresetsFn({ data: {} });

			expect(result).toEqual([
				{
					name: "HD Bluray + WEB",
					description: "Prefer high-quality Bluray and WEB releases",
					category: "Video - Movies",
					contentType: "movie",
					cfCount: 2,
					scores: { "Bluray Tier 01": 1800, "WEB Tier 01": 1700 },
					minCustomFormatScore: 0,
					upgradeUntilCustomFormatScore: 10000,
				},
				{
					name: "Lossless Audio",
					description: "Prefer lossless audio tracks",
					category: "Audio",
					contentType: "tv",
					cfCount: 1,
					scores: { FLAC: 500 },
					minCustomFormatScore: 0,
					upgradeUntilCustomFormatScore: 5000,
				},
			]);
			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		});

		it("filters by contentType", async () => {
			const result = await getPresetsFn({ data: { contentType: "tv" } });

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("Lossless Audio");
			expect(result[0].contentType).toBe("tv");
			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		});

		it("returns empty array when contentType matches nothing", async () => {
			const result = await getPresetsFn({ data: { contentType: "ebook" } });

			expect(result).toEqual([]);
			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		});
	});

	describe("applyPresetFn", () => {
		it("throws when preset not found", async () => {
			await expect(
				applyPresetFn({ data: { profileId: 1, presetName: "Nonexistent" } }),
			).rejects.toThrow('Preset "Nonexistent" not found');
			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		});

		it("throws when profile not found", async () => {
			const profileChain = createSelectChain({ get: undefined });
			mocks.select.mockReturnValueOnce(profileChain);

			await expect(
				applyPresetFn({
					data: { profileId: 999, presetName: "HD Bluray + WEB" },
				}),
			).rejects.toThrow("Download profile not found");
			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		});

		it("creates new custom formats and reuses existing ones", async () => {
			// Profile lookup
			const profileChain = createSelectChain({
				get: { id: 1, name: "Test Profile" },
			});
			mocks.select.mockReturnValueOnce(profileChain);

			// CF lookup: "Bluray Tier 01" exists, "WEB Tier 01" does not
			const existingCfChain = createSelectChain({ get: { id: 10 } });
			const missingCfChain = createSelectChain({ get: undefined });
			mocks.select
				.mockReturnValueOnce(existingCfChain)
				.mockReturnValueOnce(missingCfChain);

			// Insert for new CF "WEB Tier 01"
			const insertCfChain = createInsertChain({ get: { id: 20 } });
			mocks.insert.mockReturnValueOnce(insertCfChain);

			// Delete old profile_custom_formats
			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValueOnce(deleteChain);

			// Insert new scores
			const insertScoresChain = createInsertChain();
			mocks.insert.mockReturnValueOnce(insertScoresChain);

			// Update profile thresholds
			const updateChain = createUpdateChain();
			mocks.update.mockReturnValueOnce(updateChain);

			const result = await applyPresetFn({
				data: { profileId: 1, presetName: "HD Bluray + WEB" },
			});

			expect(result).toEqual({
				success: true,
				cfCount: 2,
				presetName: "HD Bluray + WEB",
			});

			// Verify the existing CF was not re-created
			expect(mocks.insert).toHaveBeenCalledTimes(2); // one for new CF, one for scores

			// Verify the new CF insert had correct values
			expect(insertCfChain.values).toHaveBeenCalledWith({
				name: "WEB Tier 01",
				category: "Release Group",
				specifications: [
					{ name: "spec", type: "releaseGroup", value: "^FLUX$" },
				],
				defaultScore: 0,
				contentTypes: ["movie"],
				description: "Top-tier WEB groups",
				origin: "builtin",
				userModified: false,
			});

			// Verify old scores were deleted
			expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
			expect(deleteChain.run).toHaveBeenCalledTimes(1);

			// Verify new scores were inserted with resolved CF IDs
			expect(insertScoresChain.values).toHaveBeenCalledWith([
				{ profileId: 1, customFormatId: 10, score: 1800 },
				{ profileId: 1, customFormatId: 20, score: 1700 },
			]);
			expect(insertScoresChain.run).toHaveBeenCalledTimes(1);

			// Verify profile thresholds were updated
			expect(updateChain.set).toHaveBeenCalledWith({
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 10000,
			});
			expect(updateChain.run).toHaveBeenCalledTimes(1);

			// Verify cache invalidation
			expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		});

		it("returns success with cfCount", async () => {
			// Profile lookup
			const profileChain = createSelectChain({
				get: { id: 5, name: "TV Profile" },
			});
			mocks.select.mockReturnValueOnce(profileChain);

			// CF lookup: "FLAC" exists already
			const existingCfChain = createSelectChain({ get: { id: 42 } });
			mocks.select.mockReturnValueOnce(existingCfChain);

			// Delete old scores
			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValueOnce(deleteChain);

			// Insert new scores
			const insertScoresChain = createInsertChain();
			mocks.insert.mockReturnValueOnce(insertScoresChain);

			// Update profile thresholds
			const updateChain = createUpdateChain();
			mocks.update.mockReturnValueOnce(updateChain);

			const result = await applyPresetFn({
				data: { profileId: 5, presetName: "Lossless Audio" },
			});

			expect(result).toEqual({
				success: true,
				cfCount: 1,
				presetName: "Lossless Audio",
			});

			// No CF was created (all existed), so insert only called once for scores
			expect(mocks.insert).toHaveBeenCalledTimes(1);
			expect(insertScoresChain.values).toHaveBeenCalledWith([
				{ profileId: 5, customFormatId: 42, score: 500 },
			]);
			expect(updateChain.set).toHaveBeenCalledWith({
				minCustomFormatScore: 0,
				upgradeUntilCustomFormatScore: 5000,
			});
			expect(mocks.invalidateCFCache).toHaveBeenCalledTimes(1);
		});
	});
});
