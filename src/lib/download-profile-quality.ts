/**
 * Derive a format weight from a profile's ordered items array.
 * Each inner array is a group of equivalent-quality formats.
 * Formats in the same group get the same weight.
 * Groups at the top of the list (lower index) are more preferred and get a
 * higher weight.  Returns 0 for formats not found in the profile.
 */
export function getProfileWeight(qualityId: number, items: number[][]): number {
	for (let i = 0; i < items.length; i += 1) {
		if (items[i].includes(qualityId)) {
			return items.length - i; // First group = highest weight
		}
	}
	return 0; // Not in profile
}

export function isFormatInProfile(
	qualityId: number,
	items: number[][],
): boolean {
	return items.some((group) => group.includes(qualityId));
}
