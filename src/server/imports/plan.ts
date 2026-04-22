import {
	type MatchContext,
	matchBookCandidate,
	matchMovieCandidate,
	matchSonarrShowCandidate,
} from "./match";
import type {
	ImportResourceType,
	NormalizedImportItem,
	NormalizedImportSnapshot,
} from "./normalize";

export type ImportPlanAction =
	| "create"
	| "update"
	| "skip"
	| "conflict"
	| "unresolved"
	| "unsupported";

export type ImportPlanRow = {
	sourceId: number;
	sourceKey: string;
	resourceType: ImportResourceType;
	title: string;
	action: ImportPlanAction;
	targetId: number | null;
	warning: string | null;
	selectable: boolean;
};

export type ImportPlanSection = {
	items: ImportPlanRow[];
};

export type ImportPlan = {
	settings: ImportPlanSection;
	profiles: ImportPlanSection;
	library: ImportPlanSection;
	activity: ImportPlanSection;
	unresolved: ImportPlanSection;
	unsupported: ImportPlanSection;
};

export type BuildImportPlanExistingState = MatchContext & {
	provenanceBySourceKey?: Map<
		string,
		{
			targetType: string;
			targetId: number;
		}
	>;
};

export type BuildImportPlanArgs = {
	snapshots: NormalizedImportSnapshot[];
	existingState: BuildImportPlanExistingState;
};

function sortRows(left: ImportPlanRow, right: ImportPlanRow): number {
	return (
		left.sourceId - right.sourceId ||
		left.sourceKey.localeCompare(right.sourceKey) ||
		left.title.localeCompare(right.title) ||
		left.action.localeCompare(right.action)
	);
}

function rowFromItem(args: {
	item: NormalizedImportItem;
	action: ImportPlanAction;
	targetId: number | null;
	selectable: boolean;
	warning: string | null;
}): ImportPlanRow {
	return {
		sourceId: args.item.sourceId,
		sourceKey: args.item.sourceKey,
		resourceType: args.item.resourceType,
		title: args.item.title,
		action: args.action,
		targetId: args.targetId,
		warning: args.warning,
		selectable: args.selectable,
	};
}

function push(section: ImportPlanSection, row: ImportPlanRow): void {
	section.items.push(row);
}

function buildMovieRow(
	item: NormalizedImportItem,
	existingState: BuildImportPlanExistingState,
): ImportPlanRow {
	const provenance = existingState.provenanceBySourceKey?.get(item.sourceKey);
	if (provenance) {
		return rowFromItem({
			item,
			action: "skip",
			targetId: provenance.targetId,
			selectable: false,
			warning: "Already imported from this source",
		});
	}

	const tmdbId = item.payload.tmdbId;
	if (typeof tmdbId === "number") {
		const existing = existingState.moviesByTmdbId?.get(tmdbId);
		if (existing) {
			return rowFromItem({
				item,
				action: "update",
				targetId: existing.id,
				selectable: true,
				warning: null,
			});
		}
	}

	const match = matchMovieCandidate(
		{
			tmdbId: typeof tmdbId === "number" ? tmdbId : null,
			title: item.title,
			year: typeof item.payload.year === "number" ? item.payload.year : null,
		},
		existingState,
	);

	if (match.status === "matched" && match.targetId !== null) {
		return rowFromItem({
			item,
			action: "update",
			targetId: match.targetId,
			selectable: true,
			warning: null,
		});
	}

	return rowFromItem({
		item,
		action: "create",
		targetId: null,
		selectable: true,
		warning: null,
	});
}

function buildShowRow(
	item: NormalizedImportItem,
	existingState: BuildImportPlanExistingState,
): ImportPlanRow {
	const provenance = existingState.provenanceBySourceKey?.get(item.sourceKey);
	if (provenance) {
		return rowFromItem({
			item,
			action: "skip",
			targetId: provenance.targetId,
			selectable: false,
			warning: "Already imported from this source",
		});
	}

	const match = matchSonarrShowCandidate(
		{
			tmdbId:
				typeof item.payload.tmdbId === "number" ? item.payload.tmdbId : null,
			tvdbId:
				typeof item.payload.tvdbId === "number" ? item.payload.tvdbId : null,
			title: item.title,
			year: typeof item.payload.year === "number" ? item.payload.year : null,
		},
		{
			showsByTmdbId: existingState.showsByTmdbId,
			tvdbToTmdb: existingState.tvdbToTmdb,
		},
	);

	if (match.status === "matched" && match.targetId !== null) {
		return rowFromItem({
			item,
			action: "update",
			targetId: match.targetId,
			selectable: true,
			warning: null,
		});
	}

	return rowFromItem({
		item,
		action: "unresolved",
		targetId: null,
		selectable: false,
		warning: match.reason,
	});
}

function buildBookRow(
	item: NormalizedImportItem,
	existingState: BuildImportPlanExistingState,
): ImportPlanRow {
	const provenance = existingState.provenanceBySourceKey?.get(item.sourceKey);
	if (provenance) {
		return rowFromItem({
			item,
			action: "skip",
			targetId: provenance.targetId,
			selectable: false,
			warning: "Already imported from this source",
		});
	}

	const foreignBookId =
		typeof item.payload.foreignBookId === "string"
			? item.payload.foreignBookId
			: null;
	const match = matchBookCandidate(
		{
			foreignBookId,
			title: item.title,
			authorName:
				typeof item.payload.authorName === "string"
					? item.payload.authorName
					: null,
			year: typeof item.payload.year === "number" ? item.payload.year : null,
		},
		{
			booksByForeignBookId: existingState.booksByForeignBookId,
			bookFingerprintToId: existingState.bookFingerprintToId,
		},
	);

	if (match.status === "matched" && match.targetId !== null) {
		return rowFromItem({
			item,
			action: "update",
			targetId: match.targetId,
			selectable: true,
			warning: null,
		});
	}

	return rowFromItem({
		item,
		action: "unresolved",
		targetId: null,
		selectable: false,
		warning: match.reason,
	});
}

function buildGenericRow(
	item: NormalizedImportItem,
	existingState: BuildImportPlanExistingState,
): ImportPlanRow {
	const provenance = existingState.provenanceBySourceKey?.get(item.sourceKey);
	if (provenance) {
		return rowFromItem({
			item,
			action: "skip",
			targetId: provenance.targetId,
			selectable: false,
			warning: "Already imported from this source",
		});
	}

	return rowFromItem({
		item,
		action: "create",
		targetId: null,
		selectable: true,
		warning: null,
	});
}

function buildUnsupportedRow(
	item: NormalizedImportItem,
	existingState: BuildImportPlanExistingState,
): ImportPlanRow {
	const provenance = existingState.provenanceBySourceKey?.get(item.sourceKey);
	if (provenance) {
		return rowFromItem({
			item,
			action: "skip",
			targetId: provenance.targetId,
			selectable: false,
			warning: "Already imported from this source",
		});
	}

	return rowFromItem({
		item,
		action: "unsupported",
		targetId: null,
		selectable: false,
		warning: "Unsupported source row",
	});
}

function flattenSnapshot(snapshot: NormalizedImportSnapshot): {
	settings: NormalizedImportItem[];
	profiles: NormalizedImportItem[];
	library: NormalizedImportItem[];
	activity: NormalizedImportItem[];
	unsupported: NormalizedImportItem[];
} {
	return {
		settings: snapshot.settings.items,
		profiles: [
			...snapshot.settings.qualityProfiles,
			...snapshot.settings.metadataProfiles,
		],
		library: [
			...snapshot.library.movies,
			...snapshot.library.shows,
			...snapshot.library.books,
		],
		activity: [
			...snapshot.activity.history,
			...snapshot.activity.queue,
			...snapshot.activity.blocklist,
		],
		unsupported: snapshot.unsupported,
	};
}

export function buildImportPlan(args: BuildImportPlanArgs): ImportPlan {
	const plan: ImportPlan = {
		settings: { items: [] },
		profiles: { items: [] },
		library: { items: [] },
		activity: { items: [] },
		unresolved: { items: [] },
		unsupported: { items: [] },
	};

	const sections = args.snapshots.map(flattenSnapshot);

	for (const snapshot of sections) {
		for (const item of snapshot.settings) {
			const row = buildGenericRow(item, args.existingState);
			push(plan.settings, row);
		}

		for (const item of snapshot.profiles) {
			const row = buildGenericRow(item, args.existingState);
			push(plan.profiles, row);
		}

		for (const item of snapshot.library) {
			switch (item.resourceType) {
				case "movie": {
					push(plan.library, buildMovieRow(item, args.existingState));
					break;
				}
				case "show": {
					const row = buildShowRow(item, args.existingState);
					if (row.action === "unresolved") {
						push(plan.unresolved, row);
					} else {
						push(plan.library, row);
					}
					break;
				}
				case "book": {
					const row = buildBookRow(item, args.existingState);
					if (row.action === "unresolved") {
						push(plan.unresolved, row);
					} else {
						push(plan.library, row);
					}
					break;
				}
				case "unsupported": {
					push(plan.unsupported, buildUnsupportedRow(item, args.existingState));
					break;
				}
				default: {
					push(plan.unsupported, buildUnsupportedRow(item, args.existingState));
				}
			}
		}

		for (const item of snapshot.activity) {
			const row = buildGenericRow(item, args.existingState);
			push(plan.activity, row);
		}

		for (const item of snapshot.unsupported) {
			push(plan.unsupported, buildUnsupportedRow(item, args.existingState));
		}
	}

	for (const section of Object.values(plan)) {
		section.items.sort(sortRows);
	}

	return plan;
}

export type {
	ImportResourceType,
	NormalizedImportItem,
	NormalizedImportSnapshot,
} from "./normalize";
