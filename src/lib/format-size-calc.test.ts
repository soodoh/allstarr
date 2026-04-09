import { describe, expect, it } from "vitest";
import {
	computeEffectiveSizes,
	formatEffectiveSize,
	sizeMode,
} from "./format-size-calc";

describe("format-size-calc", () => {
	it("derives the size mode from strings and string arrays", () => {
		expect(sizeMode("audiobook")).toBe("audio");
		expect(sizeMode("movie")).toBe("video");
		expect(sizeMode(["tv"])).toBe("video");
		expect(sizeMode("ebook")).toBe("ebook");
	});

	it("computes ebook sizes using page counts and defaults", () => {
		expect(
			computeEffectiveSizes("ebook", 1.5, 3, 2, {
				pageCount: 200,
			}),
		).toEqual({
			minSize: 3,
			maxSize: 6,
			preferredSize: 4,
		});

		expect(computeEffectiveSizes("ebook", 1, 0, 2, null)).toEqual({
			minSize: 3,
			maxSize: 0,
			preferredSize: 6,
		});
	});

	it("computes video sizes using video duration", () => {
		expect(
			computeEffectiveSizes("video", 10, 20, 15, {
				videoLength: 90,
			}),
		).toEqual({
			minSize: 900,
			maxSize: 1800,
			preferredSize: 1350,
		});
	});

	it("computes audio sizes from kbps and respects duration defaults", () => {
		expect(
			computeEffectiveSizes(
				"audio",
				64,
				128,
				96,
				{
					audioLength: 60,
				},
				{ defaultAudioDuration: 45 },
			),
		).toEqual({
			minSize: 28.125,
			maxSize: 56.25,
			preferredSize: 42.1875,
		});

		expect(
			computeEffectiveSizes("audio", 64, 0, 96, null, {
				defaultAudioDuration: 30,
			}),
		).toEqual({
			minSize: 14.0625,
			maxSize: 0,
			preferredSize: 21.09375,
		});
	});

	it("formats MB values for min and max contexts", () => {
		expect(formatEffectiveSize(0, "min")).toBe("0");
		expect(formatEffectiveSize(0)).toBe("No limit");
		expect(formatEffectiveSize(1536)).toBe("1.5 GB");
		expect(formatEffectiveSize(42.3)).toBe("42 MB");
	});
});
