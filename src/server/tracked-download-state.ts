import { eq } from "drizzle-orm";
import { db } from "src/db";
import { trackedDownloads } from "src/db/schema";

export const trackedDownloadStates = [
	"queued",
	"downloading",
	"completed",
	"importPending",
	"imported",
	"removed",
	"failed",
] as const;

export type TrackedDownloadState = (typeof trackedDownloadStates)[number];

export type TrackedDownloadStateDb = Pick<typeof db, "select" | "update">;
type TrackedDownloadStateUpdate = Partial<typeof trackedDownloads.$inferInsert>;

const allowedTransitions: Record<
	TrackedDownloadState,
	ReadonlySet<TrackedDownloadState>
> = {
	queued: new Set(["downloading", "completed", "removed", "failed"]),
	downloading: new Set(["completed", "removed", "failed"]),
	completed: new Set(["importPending", "failed"]),
	importPending: new Set(["imported", "failed"]),
	imported: new Set(),
	removed: new Set(),
	failed: new Set(),
};

function assertTrackedDownloadState(
	state: string,
): asserts state is TrackedDownloadState {
	if (!trackedDownloadStates.includes(state as TrackedDownloadState)) {
		throw new Error(`Unknown tracked download state ${state}.`);
	}
}

function transitionTrackedDownload(
	id: number,
	nextState: TrackedDownloadState,
	values: TrackedDownloadStateUpdate = {},
	tx: TrackedDownloadStateDb = db,
): void {
	const trackedDownload = tx
		.select({ state: trackedDownloads.state })
		.from(trackedDownloads)
		.where(eq(trackedDownloads.id, id))
		.get();

	if (!trackedDownload) {
		throw new Error(`Tracked download ${id} not found.`);
	}

	assertTrackedDownloadState(trackedDownload.state);

	if (!allowedTransitions[trackedDownload.state].has(nextState)) {
		throw new Error(
			`Cannot transition tracked download ${id} from ${trackedDownload.state} to ${nextState}.`,
		);
	}

	tx.update(trackedDownloads)
		.set({ ...values, state: nextState, updatedAt: new Date() })
		.where(eq(trackedDownloads.id, id))
		.run();
}

export function markTrackedDownloadDownloading(
	id: number,
	tx?: TrackedDownloadStateDb,
): void {
	transitionTrackedDownload(id, "downloading", {}, tx);
}

export function markTrackedDownloadCompleted(
	id: number,
	outputPath: string,
	tx?: TrackedDownloadStateDb,
): void {
	transitionTrackedDownload(id, "completed", { outputPath }, tx);
}

export function markTrackedDownloadImportPending(
	id: number,
	tx?: TrackedDownloadStateDb,
): void {
	transitionTrackedDownload(id, "importPending", {}, tx);
}

export function markTrackedDownloadImported(
	id: number,
	tx?: TrackedDownloadStateDb,
): void {
	transitionTrackedDownload(id, "imported", {}, tx);
}

export function markTrackedDownloadFailed(
	id: number,
	message: string,
	tx?: TrackedDownloadStateDb,
): void {
	transitionTrackedDownload(id, "failed", { message }, tx);
}

export function markTrackedDownloadRemoved(
	id: number,
	message: string,
	tx?: TrackedDownloadStateDb,
): void {
	transitionTrackedDownload(id, "removed", { message }, tx);
}
