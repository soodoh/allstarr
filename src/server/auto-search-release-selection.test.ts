import { buildRelease } from "src/server/auto-search-test-fixtures";
import type { ProfileInfo } from "src/server/indexers";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/db", () => ({ db: {} }));
const pack = vi.hoisted(() => ({
	qualified: vi.fn((_value: { guid: string }) => true),
}));
vi.mock("./indexers", () => ({ isPackQualified: pack.qualified }));

import type { AutoSearchGrabResult } from "./auto-search-download-dispatch";
import { grabBestReleaseForProfile } from "./auto-search-release-selection";

const profile: ProfileInfo = {
	id: 1,
	name: "Profile",
	items: [[3], [2], [1]],
	cutoff: 3,
	upgradeAllowed: true,
	categories: [7020],
	minCustomFormatScore: 0,
	upgradeUntilCustomFormatScore: 0,
};
function release(id: number, cfScore = 0, guid = String(id)) {
	return buildRelease({
		guid,
		title: guid,
		quality: { id, name: "Format", weight: 999, color: "#fff" },
		cfScore,
	});
}
function setup() {
	return {
		profile,
		releases: [release(1), release(3), release(2)],
		bestExistingWeight: 0,
		blocklistedTitles: new Set<string>(),
		grabbedGuids: new Set<string>(),
		grab: vi
			.fn<
				(
					release: ReturnType<typeof buildRelease>,
				) => Promise<AutoSearchGrabResult>
			>()
			.mockResolvedValue({ status: "grabbed" }),
	};
}

beforeEach(() => {
	pack.qualified.mockReset().mockReturnValue(true);
});

describe("profile grab selection interface", () => {
	it("chooses quality using profile preference, not a format’s global weight", async () => {
		const options = setup();
		expect(await grabBestReleaseForProfile(options)).toEqual({
			status: "grabbed",
			release: options.releases[1],
		});
		expect(options.grab).toHaveBeenCalledOnce();
	});

	it("breaks quality ties by custom-format score, preserving input order for equal rank", async () => {
		const options = setup();
		const best = release(2, 100, "best");
		expect(
			await grabBestReleaseForProfile({
				...options,
				releases: [release(2), best, release(2, 100, "tie")],
			}),
		).toEqual({ status: "grabbed", release: best });
	});

	it.each([
		{
			name: "upgrades disabled",
			upgradeAllowed: false,
			cutoff: 3,
			upgradeUntilCustomFormatScore: 0,
			best: release(3),
			next: release(1),
			expected: "grabbed",
		},
		{
			name: "quality upgrade below cutoff",
			upgradeAllowed: true,
			cutoff: 3,
			upgradeUntilCustomFormatScore: 0,
			best: release(3),
			next: release(2),
			expected: "deferred",
		},
		{
			name: "quality ceiling reached",
			upgradeAllowed: true,
			cutoff: 2,
			upgradeUntilCustomFormatScore: 0,
			best: release(3),
			next: release(2),
			expected: "grabbed",
		},
		{
			name: "custom-format upgrade below ceiling",
			upgradeAllowed: true,
			cutoff: 2,
			upgradeUntilCustomFormatScore: 200,
			best: release(2, 100),
			next: release(2, 50, "next"),
			expected: "deferred",
		},
		{
			name: "both ceilings reached",
			upgradeAllowed: true,
			cutoff: 2,
			upgradeUntilCustomFormatScore: 50,
			best: release(3, 100),
			next: release(2, 50),
			expected: "grabbed",
		},
		{
			name: "quality ceiling but unmet custom-format ceiling",
			upgradeAllowed: true,
			cutoff: 2,
			upgradeUntilCustomFormatScore: 100,
			best: release(3),
			next: release(2),
			expected: "deferred",
		},
		{
			name: "equal rank",
			upgradeAllowed: true,
			cutoff: 3,
			upgradeUntilCustomFormatScore: 100,
			best: release(2, 50, "best"),
			next: release(2, 50, "next"),
			expected: "grabbed",
		},
	])(
		"uses upgrade-safe fallback: $name",
		async ({ best, next, expected, name: _name, ...settings }) => {
			const options = setup();
			options.grab.mockResolvedValueOnce({ status: "grab_limit_reached" });
			const result = await grabBestReleaseForProfile({
				...options,
				releases: [best, next],
				profile: { ...profile, ...settings },
			});
			expect(result.status).toBe(expected);
			expect(options.grab).toHaveBeenCalledTimes(
				expected === "grabbed" ? 2 : 1,
			);
			if (result.status === "grabbed") expect(result.release).toBe(next);
		},
	);

	it("compares the alternative against every capped release and defers when all candidates are capped", async () => {
		const options = setup();
		options.grab.mockResolvedValue({ status: "grab_limit_reached" });
		expect(
			await grabBestReleaseForProfile({
				...options,
				profile: { ...profile, upgradeAllowed: false },
			}),
		).toEqual({ status: "deferred" });
		expect(options.grab).toHaveBeenCalledTimes(3);
	});

	it("does not attempt next-ranked releases for missing clients", async () => {
		const options = setup();
		options.grab.mockResolvedValueOnce({ status: "unavailable" });
		expect(await grabBestReleaseForProfile(options)).toEqual({
			status: "not_grabbed",
		});
		expect(options.grab).toHaveBeenCalledOnce();
	});

	it("propagates dispatch exceptions without swallowing retries into cap fallback", async () => {
		const options = setup();
		const error = new Error("dispatch failed");
		options.grab.mockRejectedValueOnce(error);
		await expect(grabBestReleaseForProfile(options)).rejects.toBe(error);
		expect(options.grab).toHaveBeenCalledOnce();
	});

	it.each([false, true])(
		"does not grab existing files with upgrades disabled or ceiling reached (%s)",
		async (upgradeAllowed) => {
			const options = setup();
			expect(
				await grabBestReleaseForProfile({
					...options,
					profile: { ...profile, upgradeAllowed },
					bestExistingWeight: 3,
				}),
			).toEqual({ status: "not_grabbed" });
			expect(options.grab).not.toHaveBeenCalled();
		},
	);

	it("permits meaningful existing-file upgrades but not lower quality with higher scores", async () => {
		const options = setup();
		const higherScore = release(2, 100);
		expect(
			await grabBestReleaseForProfile({
				...options,
				bestExistingWeight: 2,
				bestExistingCFScore: 50,
				releases: [release(1, 999), release(2, 40), higherScore],
			}),
		).toEqual({ status: "grabbed", release: higherScore });
	});

	it("keeps every eligibility rule before ranking and dispatch", async () => {
		const options = setup();
		const rejected = buildRelease({
			...release(3),
			rejections: [{ reason: "qualityNotWanted", message: "bad" }],
		});
		const blocked = release(3, 0, "blocked");
		const grabbed = release(3, 0, "grabbed");
		pack.qualified.mockImplementation((value) => value.guid !== "pack");
		const result = await grabBestReleaseForProfile({
			...options,
			releases: [
				release(99),
				rejected,
				blocked,
				grabbed,
				release(3, 0, "pack"),
				release(2, -1),
			],
			blocklistedTitles: new Set([blocked.title]),
			grabbedGuids: new Set([grabbed.guid]),
		});
		expect(result).toEqual({ status: "not_grabbed" });
		expect(options.grab).not.toHaveBeenCalled();
	});
});
