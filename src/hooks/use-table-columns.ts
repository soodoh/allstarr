import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import type { TableColumnDef, TableId } from "src/lib/table-column-defaults";
import {
	getDefaultColumnOrder,
	getDefaultHiddenColumns,
	TABLE_DEFAULTS,
} from "src/lib/table-column-defaults";

export type ResolvedColumns = {
	/** All columns in display order (includes hidden) */
	allColumns: TableColumnDef[];
	/** Only visible columns in display order */
	visibleColumns: TableColumnDef[];
	/** Set of hidden column keys for fast lookup */
	hiddenKeys: Set<string>;
	/** Ordered array of all column keys */
	columnOrder: string[];
	/** Array of hidden column keys */
	hiddenColumnKeys: string[];
};

export function useTableColumns(tableId: TableId): ResolvedColumns {
	const defaults = TABLE_DEFAULTS[tableId];
	const { data: userSettings } = useQuery(userSettingsQuery(tableId));

	return useMemo(() => {
		const defaultsByKey = new Map(defaults.map((c) => [c.key, c]));

		if (!userSettings || userSettings.columnOrder.length === 0) {
			const columnOrder = getDefaultColumnOrder(tableId);
			const hiddenColumnKeys = getDefaultHiddenColumns(tableId);
			const hiddenKeys = new Set(hiddenColumnKeys);
			return {
				allColumns: defaults,
				visibleColumns: defaults.filter((c) => c.locked || c.defaultVisible),
				hiddenKeys,
				columnOrder,
				hiddenColumnKeys,
			};
		}

		const { columnOrder: savedOrder, hiddenColumns: savedHidden } =
			userSettings;

		// Append any new columns not in saved order (future-proofing)
		const savedSet = new Set(savedOrder);
		const newColumns = defaults
			.filter((c) => !savedSet.has(c.key))
			.map((c) => c.key);
		const columnOrder = [...savedOrder, ...newColumns];

		// New columns default to hidden
		const hiddenColumnKeys = [...savedHidden, ...newColumns];
		const hiddenKeys = new Set(hiddenColumnKeys);

		// Enforce locked columns are never hidden
		for (const col of defaults) {
			if (col.locked) {
				hiddenKeys.delete(col.key);
			}
		}

		// Filter to only keys that exist in defaults (remove stale keys)
		const allColumns = columnOrder
			.map((key) => defaultsByKey.get(key))
			.filter((c): c is TableColumnDef => c !== undefined);

		const visibleColumns = allColumns.filter(
			(c) => c.locked || !hiddenKeys.has(c.key),
		);

		return {
			allColumns,
			visibleColumns,
			hiddenKeys,
			columnOrder: allColumns.map((c) => c.key),
			hiddenColumnKeys: [...hiddenKeys],
		};
	}, [defaults, userSettings, tableId]);
}
