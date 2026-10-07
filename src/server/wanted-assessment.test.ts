import { describe, expect, it } from "vitest";
import type { ProfileInfo } from "./indexers";
import { assessWantedItem } from "./wanted-assessment";

function profile(overrides: Partial<ProfileInfo> = {}): ProfileInfo {
	return {
		id: 1,
		name: "Books",
		items: [[3], [2], [1]],
		cutoff: 3,
		upgradeAllowed: true,
		categories: [],
		minCustomFormatScore: 0,
		upgradeUntilCustomFormatScore: 0,
		...overrides,
	};
}
function file(id: number) {
	return { quality: { quality: { id } } };
}

describe("wanted assessment", () => {
	it.each([
		{ label: "missing files", files: [], changes: {}, wanted: true, best: 0 },
		{
			label: "missing files with upgrades disabled",
			files: [],
			changes: { upgradeAllowed: false },
			wanted: true,
			best: 0,
		},
		{
			label: "below cutoff",
			files: [file(1)],
			changes: {},
			wanted: true,
			best: 1,
		},
		{
			label: "below cutoff with upgrades disabled",
			files: [file(1)],
			changes: { upgradeAllowed: false },
			wanted: false,
			best: 1,
		},
		{
			label: "at cutoff",
			files: [file(3)],
			changes: {},
			wanted: false,
			best: 3,
		},
		{
			label: "above cutoff",
			files: [file(3)],
			changes: { cutoff: 2 },
			wanted: false,
			best: 3,
		},
		{
			label: "at cutoff with custom format threshold",
			files: [file(3)],
			changes: { upgradeUntilCustomFormatScore: 50 },
			wanted: true,
			best: 3,
		},
		{
			label: "custom format threshold with upgrades disabled",
			files: [file(3)],
			changes: { upgradeUntilCustomFormatScore: 50, upgradeAllowed: false },
			wanted: false,
			best: 3,
		},
		{
			label: "unmapped existing quality",
			files: [file(99)],
			changes: {},
			wanted: true,
			best: 0,
		},
		{
			label: "unmapped cutoff",
			files: [file(1)],
			changes: { cutoff: 99 },
			wanted: false,
			best: 1,
		},
	])("assesses $label", ({ files, changes, wanted, best }) => {
		const result = assessWantedItem({
			profiles: [profile(changes)],
			activeProfileIds: [],
			existingFiles: files,
		});
		expect(result.wanted).toBe(wanted);
		expect(result.bestWeightByProfile).toEqual(new Map([[1, best]]));
	});

	it.each([
		null,
		undefined,
		false,
		0,
		"",
		"corrupt",
		{},
		{ quality: null },
		{ quality: {} },
		{ quality: { id: "3" } },
		{ quality: "bad" },
		{ quality: { id: Number.NaN } },
	])(
		"interprets malformed or missing quality without requiring transport fixtures (%s)",
		(quality) => {
			const result = assessWantedItem({
				profiles: [profile()],
				activeProfileIds: [],
				existingFiles: [{ quality }],
			});
			expect(result.wanted).toBe(true);
			expect(result.bestWeightByProfile.get(1)).toBe(0);
		},
	);

	it("preserves absent-quality interpretation even if a profile contains the unknown format", () => {
		const candidates = [profile({ items: [[0]], cutoff: 0 })];
		expect(
			assessWantedItem({
				profiles: candidates,
				activeProfileIds: [],
				existingFiles: [{ quality: null }],
			}).bestWeightByProfile.get(1),
		).toBe(0);
		expect(
			assessWantedItem({
				profiles: candidates,
				activeProfileIds: [],
				existingFiles: [{ quality: {} }],
			}).bestWeightByProfile.get(1),
		).toBe(1);
		expect(
			assessWantedItem({
				profiles: candidates,
				activeProfileIds: [],
				existingFiles: [{ quality: {} }],
			}).wanted,
		).toBe(false);
		expect(
			assessWantedItem({
				profiles: candidates,
				activeProfileIds: [],
				existingFiles: [{ quality: { quality: {} } }],
			}).bestWeightByProfile.get(1),
		).toBe(0);
	});

	it("excludes active profiles and retains unaffected profiles without mutating input", () => {
		const active = profile();
		const available = profile({ id: 2 });
		const candidates = [active, available];
		const activeIds = [null, 1, 1, 999];
		const result = assessWantedItem({
			profiles: candidates,
			activeProfileIds: activeIds,
			existingFiles: [],
		});
		expect(result).toEqual({
			wanted: true,
			profiles: [available],
			bestWeightByProfile: new Map([[2, 0]]),
		});
		expect(candidates).toEqual([active, available]);
		expect(activeIds).toEqual([null, 1, 1, 999]);
	});

	it.each([{ profiles: [] }, { profiles: [profile()] }])(
		"is not wanted when no profiles remain available (%s)",
		({ profiles }) => {
			expect(
				assessWantedItem({
					profiles,
					activeProfileIds: [1],
					existingFiles: [],
				}),
			).toEqual({
				wanted: false,
				profiles: [],
				bestWeightByProfile: new Map(),
			});
		},
	);

	it("computes the best weight independently for each ordered profile", () => {
		const first = profile();
		const second = profile({ id: 2, items: [[1, 2], [3]], cutoff: 1 });
		const result = assessWantedItem({
			profiles: [first, second],
			activeProfileIds: [],
			existingFiles: [file(3), file(2), file(99)],
		});
		expect(result.bestWeightByProfile).toEqual(
			new Map([
				[1, 3],
				[2, 2],
			]),
		);
		expect(result.wanted).toBe(false);
	});

	it("retains every available profile when only one qualifies for an upgrade", () => {
		const satisfied = profile({ upgradeAllowed: false });
		const upgrade = profile({ id: 2 });
		expect(
			assessWantedItem({
				profiles: [satisfied, upgrade],
				activeProfileIds: [],
				existingFiles: [file(1)],
			}).profiles,
		).toEqual([satisfied, upgrade]);
	});

	it("handles profiles with empty quality groups", () => {
		expect(
			assessWantedItem({
				profiles: [profile({ items: [] })],
				activeProfileIds: [],
				existingFiles: [file(3)],
			}),
		).toMatchObject({ wanted: false, bestWeightByProfile: new Map([[1, 0]]) });
	});
});
