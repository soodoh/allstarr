import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import type { TableId } from "src/lib/table-column-defaults";

const PAGE_VIEW_DEFAULTS: Partial<Record<TableId, "table" | "grid">> = {
	authors: "table",
	books: "table",
	movies: "grid",
	tv: "grid",
	manga: "grid",
};

function useViewMode(tableId: TableId) {
	const { data: settings } = useQuery(userSettingsQuery(tableId));
	const upsert = useUpsertUserSettings();

	const defaultView = PAGE_VIEW_DEFAULTS[tableId] ?? "table";
	const view = settings?.viewMode ?? defaultView;

	const setView = useCallback(
		(mode: "table" | "grid") => {
			upsert.mutate({ tableId, viewMode: mode });
		},
		[tableId, upsert],
	);

	return [view, setView] as const;
}

export default useViewMode;
