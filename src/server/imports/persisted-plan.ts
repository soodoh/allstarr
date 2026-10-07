import { eq } from "drizzle-orm";
import { db } from "src/db";
import {
	books,
	booksAuthors,
	importProvenance,
	importSnapshots,
	importSources,
	movies,
	shows,
} from "src/db/schema";
import { applyImportPlan } from "./apply";
import { buildBookFingerprint } from "./match";
import type { NormalizedImportSnapshot } from "./normalize";
import {
	buildImportPlan,
	type ImportPlanPayload,
	type ImportPlanRow,
} from "./plan";

type ImportPlanReadRow = {
	action: string;
	payload: ImportPlanPayload;
	reason: string | null;
	resourceType: string;
	selectable: boolean;
	sourceKey: string;
	sourceSummary: string;
	target: {
		id: number | null;
		label: string | null;
	};
	title: string;
};

type ImportReviewReadRow = {
	action: string;
	payload: ImportPlanPayload;
	reason: string | null;
	resourceType: string;
	sourceKey: string;
	sourceSummary: string;
	status: "ready" | "blocked" | "unresolved";
	target: {
		id: number | null;
		label: string | null;
	};
	title: string;
};

function flattenPlanRows(
	plan: ReturnType<typeof buildImportPlan>,
): ImportPlanRow[] {
	return [
		...plan.settings.items,
		...plan.qualityProfiles.items,
		...plan.metadataProfiles.items,
		...plan.library.items,
		...plan.activity.items,
		...plan.unresolved.items,
		...plan.unsupported.items,
	];
}

function getLatestSnapshot(sourceId: number) {
	return db
		.select()
		.from(importSnapshots)
		.where(eq(importSnapshots.sourceId, sourceId))
		.orderBy(importSnapshots.fetchedAt)
		.all()
		.at(-1);
}

function getTargetLabel(
	resourceType: string,
	targetId: number | null,
): string | null {
	if (targetId === null) {
		return null;
	}

	if (resourceType === "movie") {
		return (
			db
				.select({ title: movies.title })
				.from(movies)
				.where(eq(movies.id, targetId))
				.get()?.title ?? null
		);
	}

	if (resourceType === "show") {
		return (
			db
				.select({ title: shows.title })
				.from(shows)
				.where(eq(shows.id, targetId))
				.get()?.title ?? null
		);
	}

	if (resourceType === "book") {
		return (
			db
				.select({ title: books.title })
				.from(books)
				.where(eq(books.id, targetId))
				.get()?.title ?? null
		);
	}

	return null;
}

function formatSourceSummary(row: ImportPlanRow): string {
	const payload = row.payload ?? {};

	if (row.resourceType === "show") {
		const tmdbId =
			typeof payload.tmdbId === "number" ? `TMDB ${payload.tmdbId}` : null;
		const tvdbId =
			typeof payload.tvdbId === "number" ? `TVDB ${payload.tvdbId}` : null;
		return [tmdbId, tvdbId].filter(Boolean).join(" | ") || "Mapped show item";
	}

	if (row.resourceType === "movie") {
		return typeof payload.tmdbId === "number"
			? `TMDB ${payload.tmdbId}`
			: "Mapped movie item";
	}

	if (row.resourceType === "book") {
		const author =
			typeof payload.authorName === "string"
				? `Author ${payload.authorName}`
				: null;
		const foreignBookId =
			typeof payload.foreignBookId === "string"
				? `Hardcover ${payload.foreignBookId}`
				: null;
		return (
			[author, foreignBookId].filter(Boolean).join(" | ") || "Mapped book item"
		);
	}

	if (row.resourceType === "profile") {
		return typeof payload.profileKind === "string"
			? `${payload.profileKind} profile`
			: "Profile row";
	}

	if (row.resourceType === "setting") {
		return typeof payload.group === "string" ? payload.group : "Setting row";
	}

	return row.resourceType;
}

function canonicalPayload(row: ImportPlanRow): ImportPlanPayload {
	return row.targetId === null
		? row.payload
		: { ...row.payload, targetId: row.targetId };
}
function serializeRow(row: ImportPlanRow) {
	return {
		action: row.action,
		payload: canonicalPayload(row),
		reason: row.warning,
		resourceType: row.resourceType,
		sourceKey: row.sourceKey,
		sourceSummary: formatSourceSummary(row),
		target: {
			id: row.targetId,
			label: getTargetLabel(row.resourceType, row.targetId),
		},
		title: row.title,
	};
}
function serializePlanRow(row: ImportPlanRow): ImportPlanReadRow {
	return { ...serializeRow(row), selectable: row.selectable };
}
function serializeReviewRow(row: ImportPlanRow): ImportReviewReadRow {
	return {
		...serializeRow(row),
		status: row.action === "unresolved" ? "unresolved" : "blocked",
	};
}

function loadExistingState() {
	const moviesByTmdbId = new Map(
		db
			.select({ id: movies.id, tmdbId: movies.tmdbId })
			.from(movies)
			.all()
			.map((row) => [row.tmdbId, { id: row.id }] as const),
	);

	const showsByTmdbId = new Map(
		db
			.select({ id: shows.id, tmdbId: shows.tmdbId })
			.from(shows)
			.all()
			.map((row) => [row.tmdbId, { id: row.id }] as const),
	);

	const booksByForeignBookId = new Map(
		db
			.select({
				foreignBookId: books.foreignBookId,
				id: books.id,
				releaseYear: books.releaseYear,
				title: books.title,
			})
			.from(books)
			.all()
			.filter(
				(
					row,
				): row is {
					foreignBookId: string;
					id: number;
					releaseYear: number | null;
					title: string;
				} =>
					typeof row.foreignBookId === "string" && row.foreignBookId.length > 0,
			)
			.map((row) => [row.foreignBookId, { id: row.id }] as const),
	);

	const primaryAuthorByBookId = new Map<number, string>();
	for (const row of db
		.select({
			authorName: booksAuthors.authorName,
			bookId: booksAuthors.bookId,
			isPrimary: booksAuthors.isPrimary,
		})
		.from(booksAuthors)
		.all()
		.sort(
			(left, right) =>
				Number(right.isPrimary) - Number(left.isPrimary) ||
				left.bookId - right.bookId,
		)) {
		if (!primaryAuthorByBookId.has(row.bookId)) {
			primaryAuthorByBookId.set(row.bookId, row.authorName);
		}
	}

	const bookFingerprintToId = new Map(
		db
			.select({
				id: books.id,
				releaseYear: books.releaseYear,
				title: books.title,
			})
			.from(books)
			.all()
			.map((row) => {
				const authorName = primaryAuthorByBookId.get(row.id) ?? null;
				const fingerprint = buildBookFingerprint({
					authorName,
					title: row.title,
					year: row.releaseYear,
				});
				return fingerprint.length > 0 ? ([fingerprint, row.id] as const) : null;
			})
			.filter((entry): entry is readonly [string, number] => entry !== null),
	);

	const provenanceBySourceKey = new Map(
		db
			.select({
				sourceKey: importProvenance.sourceKey,
				targetId: importProvenance.targetId,
				targetType: importProvenance.targetType,
			})
			.from(importProvenance)
			.all()
			.map(
				(row) =>
					[
						row.sourceKey,
						{
							targetId: Number(row.targetId),
							targetType: row.targetType,
						},
					] as const,
			)
			.filter((entry) => Number.isInteger(entry[1].targetId)),
	);

	return {
		bookFingerprintToId,
		booksByForeignBookId,
		moviesByTmdbId,
		provenanceBySourceKey,
		showsByTmdbId,
	};
}

function loadPersistedPlan(sourceId: number) {
	const source = db
		.select()
		.from(importSources)
		.where(eq(importSources.id, sourceId))
		.get();
	if (!source) throw new Error("Import source not found");
	const snapshot = getLatestSnapshot(sourceId);
	if (!snapshot) return undefined;
	return buildImportPlan({
		snapshots: [snapshot.payload as NormalizedImportSnapshot],
		existingState: loadExistingState(),
	});
}

export function readImportPlan(sourceId: number): ImportPlanReadRow[] {
	const plan = loadPersistedPlan(sourceId);
	if (!plan) return [];
	return [
		...plan.settings.items,
		...plan.qualityProfiles.items,
		...plan.metadataProfiles.items,
		...plan.library.items,
		...plan.activity.items,
	].map(serializePlanRow);
}

export function readImportReview(sourceId: number): ImportReviewReadRow[] {
	const plan = loadPersistedPlan(sourceId);
	if (!plan) return [];
	return [
		...plan.unresolved.items,
		...plan.unsupported.items,
		...plan.settings.items.filter((row) => !row.selectable),
		...plan.qualityProfiles.items.filter((row) => !row.selectable),
		...plan.metadataProfiles.items.filter((row) => !row.selectable),
		...plan.library.items.filter((row) => !row.selectable),
		...plan.activity.items.filter((row) => !row.selectable),
	].map(serializeReviewRow);
}

export async function applyPersistedImportPlan(
	sourceId: number,
	selectedKeys: readonly string[],
) {
	const plan = loadPersistedPlan(sourceId);
	if (!plan) throw new Error("Import snapshot not found");
	const canonicalRows = new Map(
		flattenPlanRows(plan).map((row) => [row.sourceKey, row]),
	);
	const selectedRows = selectedKeys.map((sourceKey) => {
		const canonical = canonicalRows.get(sourceKey);
		if (!canonical)
			throw new Error(`Import plan row not found for ${sourceKey}`);
		return {
			action: canonical.action,
			payload: canonicalPayload(canonical),
			resourceType: canonical.resourceType,
			sourceKey: canonical.sourceKey,
		};
	});
	return applyImportPlan({ sourceId, selectedRows });
}
