import { describe, expect, it } from "vitest";
import {
	getDefaultColumnOrder,
	getDefaultHiddenColumns,
	TABLE_DEFAULTS,
	TABLE_IDS,
} from "./table-column-defaults";

describe("table column defaults", () => {
	it("returns a stable key order for every table id", () => {
		for (const tableId of TABLE_IDS) {
			expect(getDefaultColumnOrder(tableId)).toEqual(
				TABLE_DEFAULTS[tableId].map((column) => column.key),
			);
		}
	});

	it("returns only non-locked hidden columns", () => {
		for (const tableId of TABLE_IDS) {
			const hidden = getDefaultHiddenColumns(tableId);
			expect(hidden).toEqual(
				TABLE_DEFAULTS[tableId]
					.filter((column) => !column.locked && !column.defaultVisible)
					.map((column) => column.key),
			);
		}
	});
});
