import type { CustomFormatSpecification } from "src/db/schema/custom-formats";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseAttributes } from "./cf-scoring";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
	selectAll: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				innerJoin: vi.fn(() => ({
					where: vi.fn(() => ({
						all: mocks.selectAll,
					})),
				})),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	customFormats: { id: "customFormats.id" },
	profileCustomFormats: {
		customFormatId: "pcf.customFormatId",
		profileId: "pcf.profileId",
	},
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSpec(
	overrides: Partial<CustomFormatSpecification> & { type: string },
): CustomFormatSpecification {
	return {
		name: overrides.name ?? "spec",
		type: overrides.type,
		value: overrides.value,
		min: overrides.min,
		max: overrides.max,
		negate: overrides.negate ?? false,
		required: overrides.required ?? false,
	};
}

function makeDBRow(opts: {
	cfId: number;
	name: string;
	score: number;
	specs: CustomFormatSpecification[];
	contentTypes?: string[];
}) {
	return {
		cfId: opts.cfId,
		score: opts.score,
		name: opts.name,
		specifications: opts.specs,
		contentTypes: opts.contentTypes ?? [],
	};
}

const baseAttrs: ReleaseAttributes = {
	title: "Some.Movie.2024.1080p.BluRay.x264",
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("cf-scoring", () => {
	let calculateCFScore: typeof import("./cf-scoring").calculateCFScore;
	let invalidateCFCache: typeof import("./cf-scoring").invalidateCFCache;

	beforeEach(async () => {
		vi.resetModules();
		mocks.selectAll.mockReset();
		const mod = await import("./cf-scoring");
		calculateCFScore = mod.calculateCFScore;
		invalidateCFCache = mod.invalidateCFCache;
	});

	// ── Cache behavior ───────────────────────────────────────────────────

	describe("invalidateCFCache", () => {
		it("clears cache so the next call re-queries the DB", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "CF1",
					score: 100,
					specs: [makeSpec({ type: "releaseTitle", value: "." })],
				}),
			]);

			// First call — populates cache
			calculateCFScore(1, baseAttrs);
			expect(mocks.selectAll).toHaveBeenCalledTimes(1);

			// Second call — should use cache
			calculateCFScore(1, baseAttrs);
			expect(mocks.selectAll).toHaveBeenCalledTimes(1);

			// Invalidate and call again — should re-query
			invalidateCFCache();
			calculateCFScore(1, baseAttrs);
			expect(mocks.selectAll).toHaveBeenCalledTimes(2);
		});
	});

	// ── Regex spec matching ──────────────────────────────────────────────

	describe("regex spec matching", () => {
		it("matches releaseTitle with a regex pattern", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "BluRay",
					score: 50,
					specs: [
						makeSpec({ type: "releaseTitle", value: "bluray", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie.2024.1080p.BluRay.x264",
			});
			expect(result.totalScore).toBe(50);
			expect(result.matchedFormats).toHaveLength(1);
		});

		it("does not match when regex does not match title", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "BluRay",
					score: 50,
					specs: [
						makeSpec({ type: "releaseTitle", value: "remux", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie.2024.1080p.BluRay.x264",
			});
			expect(result.totalScore).toBe(0);
			expect(result.matchedFormats).toHaveLength(0);
		});

		it("matches releaseGroup against attrs.group", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "FraMeSToR",
					score: 30,
					specs: [
						makeSpec({
							type: "releaseGroup",
							value: "^FraMeSToR$",
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				group: "FraMeSToR",
			});
			expect(result.totalScore).toBe(30);
		});

		it("matches edition against attrs.edition", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Director's Cut",
					score: 20,
					specs: [
						makeSpec({ type: "edition", value: "director", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				edition: "Director's Cut",
			});
			expect(result.totalScore).toBe(20);
		});

		it("matches videoCodec against attrs.videoCodec", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "x265",
					score: 15,
					specs: [
						makeSpec({
							type: "videoCodec",
							value: "x265|hevc",
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				videoCodec: "x265",
			});
			expect(result.totalScore).toBe(15);
		});

		it("matches audioCodec against attrs.audioCodec", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "DTS-HD MA",
					score: 25,
					specs: [
						makeSpec({ type: "audioCodec", value: "dts.?hd", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				audioCodec: "DTS-HD MA",
			});
			expect(result.totalScore).toBe(25);
		});

		it("matches narrator against attrs.narrator", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Narrator",
					score: 10,
					specs: [makeSpec({ type: "narrator", value: "fry", required: true })],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Book",
				narrator: "Stephen Fry",
			});
			expect(result.totalScore).toBe(10);
		});

		it("matches publisher against attrs.publisher", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Publisher",
					score: 5,
					specs: [
						makeSpec({ type: "publisher", value: "penguin", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Book",
				publisher: "Penguin Random House",
			});
			expect(result.totalScore).toBe(5);
		});

		it("handles invalid regex gracefully (no match)", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Bad Regex",
					score: 100,
					specs: [
						makeSpec({
							type: "releaseTitle",
							value: "[invalid(",
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "anything" });
			expect(result.totalScore).toBe(0);
		});

		it("does not match regex when target attribute is undefined", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Group",
					score: 10,
					specs: [
						makeSpec({ type: "releaseGroup", value: ".*", required: true }),
					],
				}),
			]);
			// group is undefined
			const result = calculateCFScore(1, { title: "Movie" });
			expect(result.totalScore).toBe(0);
		});
	});

	// ── Enum spec matching ───────────────────────────────────────────────

	describe("enum spec matching", () => {
		it("matches videoSource exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "BluRay Source",
					score: 40,
					specs: [
						makeSpec({ type: "videoSource", value: "BluRay", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				videoSource: "BluRay",
			});
			expect(result.totalScore).toBe(40);
		});

		it("does not match videoSource when values differ", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "BluRay Source",
					score: 40,
					specs: [
						makeSpec({ type: "videoSource", value: "BluRay", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				videoSource: "WEB-DL",
			});
			expect(result.totalScore).toBe(0);
		});

		it("matches resolution exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "1080p",
					score: 20,
					specs: [
						makeSpec({ type: "resolution", value: "1080p", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				resolution: "1080p",
			});
			expect(result.totalScore).toBe(20);
		});

		it("matches language exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "English",
					score: 10,
					specs: [makeSpec({ type: "language", value: "en", required: true })],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie", language: "en" });
			expect(result.totalScore).toBe(10);
		});

		it("matches qualityModifier exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Proper",
					score: 15,
					specs: [
						makeSpec({
							type: "qualityModifier",
							value: "proper",
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				qualityModifier: "proper",
			});
			expect(result.totalScore).toBe(15);
		});

		it("matches audioChannels exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "7.1",
					score: 10,
					specs: [
						makeSpec({ type: "audioChannels", value: "7.1", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				audioChannels: "7.1",
			});
			expect(result.totalScore).toBe(10);
		});

		it("matches hdrFormat exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "DV HDR10+",
					score: 30,
					specs: [
						makeSpec({ type: "hdrFormat", value: "DV HDR10+", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				hdrFormat: "DV HDR10+",
			});
			expect(result.totalScore).toBe(30);
		});

		it("matches streamingService exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Netflix",
					score: 5,
					specs: [
						makeSpec({
							type: "streamingService",
							value: "NFLX",
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				streamingService: "NFLX",
			});
			expect(result.totalScore).toBe(5);
		});

		it("matches releaseType exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Scene",
					score: -10,
					specs: [
						makeSpec({ type: "releaseType", value: "scene", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				releaseType: "scene",
			});
			expect(result.totalScore).toBe(-10);
		});

		it("matches fileFormat exactly", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "MKV",
					score: 5,
					specs: [
						makeSpec({ type: "fileFormat", value: "mkv", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie", fileFormat: "mkv" });
			expect(result.totalScore).toBe(5);
		});

		it("does not match enum when target is undefined", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "1080p",
					score: 20,
					specs: [
						makeSpec({ type: "resolution", value: "1080p", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie" });
			expect(result.totalScore).toBe(0);
		});
	});

	// ── Range spec matching ──────────────────────────────────────────────

	describe("range spec matching", () => {
		it("matches size within min/max range", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Good Size",
					score: 10,
					specs: [
						makeSpec({ type: "size", min: 500, max: 2000, required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie", sizeMB: 1000 });
			expect(result.totalScore).toBe(10);
		});

		it("matches size at exact boundaries (inclusive)", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Good Size",
					score: 10,
					specs: [
						makeSpec({ type: "size", min: 500, max: 2000, required: true }),
					],
				}),
			]);
			expect(
				calculateCFScore(1, { title: "Movie", sizeMB: 500 }).totalScore,
			).toBe(10);

			invalidateCFCache();
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Good Size",
					score: 10,
					specs: [
						makeSpec({ type: "size", min: 500, max: 2000, required: true }),
					],
				}),
			]);
			expect(
				calculateCFScore(1, { title: "Movie", sizeMB: 2000 }).totalScore,
			).toBe(10);
		});

		it("does not match size outside range", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Good Size",
					score: 10,
					specs: [
						makeSpec({ type: "size", min: 500, max: 2000, required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie", sizeMB: 3000 });
			expect(result.totalScore).toBe(0);
		});

		it("uses 0 as default min and Infinity as default max", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "No min",
					score: 10,
					specs: [makeSpec({ type: "size", max: 5000, required: true })],
				}),
			]);
			// min defaults to 0, so sizeMB=0 should match
			expect(
				calculateCFScore(1, { title: "Movie", sizeMB: 0 }).totalScore,
			).toBe(10);

			invalidateCFCache();
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "No max",
					score: 10,
					specs: [makeSpec({ type: "size", min: 100, required: true })],
				}),
			]);
			// max defaults to Infinity, so any large value should match
			expect(
				calculateCFScore(1, { title: "Movie", sizeMB: 999999 }).totalScore,
			).toBe(10);
		});

		it("matches audioBitrate range", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "High Bitrate",
					score: 15,
					specs: [
						makeSpec({
							type: "audioBitrate",
							min: 256,
							max: 512,
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				audioBitrateKbps: 320,
			});
			expect(result.totalScore).toBe(15);
		});

		it("matches audioDuration range", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Long Audio",
					score: 5,
					specs: [
						makeSpec({
							type: "audioDuration",
							min: 60,
							max: 600,
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Book",
				audioDurationMinutes: 120,
			});
			expect(result.totalScore).toBe(5);
		});

		it("matches year range", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Recent",
					score: 10,
					specs: [
						makeSpec({ type: "year", min: 2020, max: 2026, required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie", year: 2024 });
			expect(result.totalScore).toBe(10);
		});

		it("does not match range when target is undefined", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Size check",
					score: 10,
					specs: [
						makeSpec({ type: "size", min: 0, max: 5000, required: true }),
					],
				}),
			]);
			// sizeMB is undefined
			const result = calculateCFScore(1, { title: "Movie" });
			expect(result.totalScore).toBe(0);
		});
	});

	// ── indexerFlag bitwise matching ─────────────────────────────────────

	describe("indexerFlag bitwise matching", () => {
		it("matches when flag bit is set", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Freeleech",
					score: 25,
					specs: [
						makeSpec({ type: "indexerFlag", value: "1", required: true }),
					],
				}),
			]);
			// 0b0011 has bit 1 set
			const result = calculateCFScore(1, { title: "Movie", indexerFlags: 3 });
			expect(result.totalScore).toBe(25);
		});

		it("does not match when flag bit is not set", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Freeleech",
					score: 25,
					specs: [
						makeSpec({ type: "indexerFlag", value: "4", required: true }),
					],
				}),
			]);
			// 0b0011 does NOT have bit 4 set
			const result = calculateCFScore(1, { title: "Movie", indexerFlags: 3 });
			expect(result.totalScore).toBe(0);
		});

		it("does not match when indexerFlags is undefined", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Freeleech",
					score: 25,
					specs: [
						makeSpec({ type: "indexerFlag", value: "1", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie" });
			expect(result.totalScore).toBe(0);
		});

		it("does not match when value is not a valid number", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Bad Flag",
					score: 25,
					specs: [
						makeSpec({
							type: "indexerFlag",
							value: "notanumber",
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				indexerFlags: 0xff,
			});
			expect(result.totalScore).toBe(0);
		});
	});

	// ── Negate flag ──────────────────────────────────────────────────────

	describe("negate flag", () => {
		it("inverts a matching regex spec to not match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Not BluRay",
					score: -50,
					specs: [
						makeSpec({
							type: "releaseTitle",
							value: "bluray",
							negate: true,
							required: true,
						}),
					],
				}),
			]);
			// Title contains BluRay -> regex matches -> negate inverts -> spec does NOT match
			const result = calculateCFScore(1, { title: "Movie.BluRay.1080p" });
			expect(result.totalScore).toBe(0);
		});

		it("inverts a non-matching regex spec to match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Not BluRay",
					score: 10,
					specs: [
						makeSpec({
							type: "releaseTitle",
							value: "bluray",
							negate: true,
							required: true,
						}),
					],
				}),
			]);
			// Title does NOT contain BluRay -> regex no match -> negate inverts -> spec MATCHES
			const result = calculateCFScore(1, { title: "Movie.WEB-DL.1080p" });
			expect(result.totalScore).toBe(10);
		});

		it("inverts an enum match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Not 720p",
					score: 5,
					specs: [
						makeSpec({
							type: "resolution",
							value: "720p",
							negate: true,
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				resolution: "1080p",
			});
			expect(result.totalScore).toBe(5);
		});

		it("inverts a range match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Not small",
					score: 10,
					specs: [
						makeSpec({
							type: "size",
							min: 0,
							max: 500,
							negate: true,
							required: true,
						}),
					],
				}),
			]);
			// 1000 is within [0, 500]? No -> negate inverts -> true? Actually 1000 is NOT in range -> false -> negate -> true
			const result = calculateCFScore(1, { title: "Movie", sizeMB: 1000 });
			expect(result.totalScore).toBe(10);
		});

		it("inverts an indexerFlag match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Not Freeleech",
					score: -5,
					specs: [
						makeSpec({
							type: "indexerFlag",
							value: "1",
							negate: true,
							required: true,
						}),
					],
				}),
			]);
			// Flag 1 IS set in 0b11 -> match -> negate inverts -> no match
			const result = calculateCFScore(1, { title: "Movie", indexerFlags: 3 });
			expect(result.totalScore).toBe(0);
		});
	});

	// ── AND/OR logic (evaluateCF) ────────────────────────────────────────

	describe("AND/OR logic", () => {
		it("returns false for empty specs array (CF with no specs)", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({ cfId: 1, name: "Empty", score: 100, specs: [] }),
			]);
			const result = calculateCFScore(1, baseAttrs);
			expect(result.totalScore).toBe(0);
		});

		it("matches when all required specs match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "All Required",
					score: 50,
					specs: [
						makeSpec({ type: "releaseTitle", value: "bluray", required: true }),
						makeSpec({ type: "resolution", value: "1080p", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie.BluRay.1080p",
				resolution: "1080p",
			});
			expect(result.totalScore).toBe(50);
		});

		it("fails when one required spec does not match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Partial Required",
					score: 50,
					specs: [
						makeSpec({ type: "releaseTitle", value: "bluray", required: true }),
						makeSpec({ type: "resolution", value: "4K", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie.BluRay.1080p",
				resolution: "1080p",
			});
			expect(result.totalScore).toBe(0);
		});

		it("matches when at least one optional spec matches (no required)", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Optional OR",
					score: 30,
					specs: [
						makeSpec({ type: "releaseTitle", value: "remux", required: false }),
						makeSpec({
							type: "releaseTitle",
							value: "bluray",
							required: false,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie.BluRay.1080p" });
			expect(result.totalScore).toBe(30);
		});

		it("fails when no optional specs match (no required)", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "No Optional Match",
					score: 30,
					specs: [
						makeSpec({ type: "releaseTitle", value: "remux", required: false }),
						makeSpec({ type: "releaseTitle", value: "webdl", required: false }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie.BluRay.1080p" });
			expect(result.totalScore).toBe(0);
		});

		it("requires all required AND at least one optional to match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Mixed",
					score: 60,
					specs: [
						makeSpec({ type: "resolution", value: "1080p", required: true }),
						makeSpec({ type: "releaseTitle", value: "remux", required: false }),
						makeSpec({
							type: "releaseTitle",
							value: "bluray",
							required: false,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie.BluRay.1080p",
				resolution: "1080p",
			});
			expect(result.totalScore).toBe(60);
		});

		it("fails when required matches but no optional matches", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Mixed Fail",
					score: 60,
					specs: [
						makeSpec({ type: "resolution", value: "1080p", required: true }),
						makeSpec({ type: "releaseTitle", value: "remux", required: false }),
						makeSpec({ type: "releaseTitle", value: "webdl", required: false }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie.BluRay.1080p",
				resolution: "1080p",
			});
			expect(result.totalScore).toBe(0);
		});

		it("matches when required pass and there are no optional specs", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Only Required",
					score: 40,
					specs: [
						makeSpec({ type: "resolution", value: "1080p", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie",
				resolution: "1080p",
			});
			expect(result.totalScore).toBe(40);
		});
	});

	// ── contentType filtering ────────────────────────────────────────────

	describe("contentType filtering", () => {
		it("includes CFs with matching contentType", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Movie CF",
					score: 10,
					specs: [
						makeSpec({ type: "releaseTitle", value: ".", required: true }),
					],
					contentTypes: ["movie"],
				}),
			]);
			const result = calculateCFScore(1, baseAttrs, "movie");
			expect(result.totalScore).toBe(10);
		});

		it("excludes CFs with non-matching contentType", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Movie CF",
					score: 10,
					specs: [
						makeSpec({ type: "releaseTitle", value: ".", required: true }),
					],
					contentTypes: ["movie"],
				}),
			]);
			const result = calculateCFScore(1, baseAttrs, "series");
			expect(result.totalScore).toBe(0);
			expect(result.matchedFormats).toHaveLength(0);
		});

		it("includes CFs with empty contentTypes (applies to all)", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Universal CF",
					score: 10,
					specs: [
						makeSpec({ type: "releaseTitle", value: ".", required: true }),
					],
					contentTypes: [],
				}),
			]);
			const result = calculateCFScore(1, baseAttrs, "movie");
			expect(result.totalScore).toBe(10);
		});

		it('includes CFs with "any" contentType', () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Any CF",
					score: 10,
					specs: [
						makeSpec({ type: "releaseTitle", value: ".", required: true }),
					],
					contentTypes: ["any"],
				}),
			]);
			const result = calculateCFScore(1, baseAttrs, "series");
			expect(result.totalScore).toBe(10);
		});

		it("skips contentType filtering when cfContentType is not provided", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Movie Only",
					score: 10,
					specs: [
						makeSpec({ type: "releaseTitle", value: ".", required: true }),
					],
					contentTypes: ["movie"],
				}),
				makeDBRow({
					cfId: 2,
					name: "Series Only",
					score: 20,
					specs: [
						makeSpec({ type: "releaseTitle", value: ".", required: true }),
					],
					contentTypes: ["series"],
				}),
			]);
			// No cfContentType — all CFs should be evaluated
			const result = calculateCFScore(1, baseAttrs);
			expect(result.totalScore).toBe(30);
			expect(result.matchedFormats).toHaveLength(2);
		});
	});

	// ── Score summing ────────────────────────────────────────────────────

	describe("score summing", () => {
		it("sums scores across multiple matching CFs", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "CF A",
					score: 100,
					specs: [
						makeSpec({ type: "releaseTitle", value: "movie", required: true }),
					],
				}),
				makeDBRow({
					cfId: 2,
					name: "CF B",
					score: 50,
					specs: [
						makeSpec({ type: "resolution", value: "1080p", required: true }),
					],
				}),
				makeDBRow({
					cfId: 3,
					name: "CF C",
					score: -30,
					specs: [
						makeSpec({ type: "videoSource", value: "CAM", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, {
				title: "Movie.1080p.BluRay",
				resolution: "1080p",
				videoSource: "BluRay",
			});
			// CF A (100) + CF B (50), CF C does not match
			expect(result.totalScore).toBe(150);
			expect(result.matchedFormats).toEqual([
				{ cfId: 1, name: "CF A", score: 100 },
				{ cfId: 2, name: "CF B", score: 50 },
			]);
		});

		it("returns zero when no CFs match", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "CF A",
					score: 100,
					specs: [
						makeSpec({ type: "releaseTitle", value: "zzzzz", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie" });
			expect(result.totalScore).toBe(0);
			expect(result.matchedFormats).toEqual([]);
		});

		it("handles negative scores in the sum", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Good",
					score: 100,
					specs: [
						makeSpec({ type: "releaseTitle", value: "movie", required: true }),
					],
				}),
				makeDBRow({
					cfId: 2,
					name: "Bad",
					score: -200,
					specs: [
						makeSpec({ type: "releaseTitle", value: "movie", required: true }),
					],
				}),
			]);
			const result = calculateCFScore(1, { title: "Movie.1080p" });
			expect(result.totalScore).toBe(-100);
			expect(result.matchedFormats).toHaveLength(2);
		});

		it("returns empty result when profile has no CFs", () => {
			mocks.selectAll.mockReturnValue([]);
			const result = calculateCFScore(1, baseAttrs);
			expect(result.totalScore).toBe(0);
			expect(result.matchedFormats).toEqual([]);
		});
	});

	// ── Unknown spec type ────────────────────────────────────────────────

	describe("unknown spec type", () => {
		it("does not match an unknown spec type", () => {
			mocks.selectAll.mockReturnValue([
				makeDBRow({
					cfId: 1,
					name: "Unknown",
					score: 50,
					specs: [
						makeSpec({
							type: "unknownType",
							value: "anything",
							required: true,
						}),
					],
				}),
			]);
			const result = calculateCFScore(1, baseAttrs);
			expect(result.totalScore).toBe(0);
		});
	});
});
