import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "src/db";
import { jobRuns } from "src/db/schema";

export const NON_TERMINAL_JOB_STATUSES = ["queued", "running"] as const;
export const JOB_HEARTBEAT_INTERVAL_MS = 10_000;
export const JOB_STALE_AFTER_MS = 5 * 60_000;

export type JobRunSourceType = "scheduled" | "command";

export type JobRunStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled"
	| "stale";

export type AcquireJobRunInput = {
	sourceType: JobRunSourceType;
	jobType: string;
	displayName: string;
	dedupeKey?: string;
	dedupeValue?: string;
	metadata?: Record<string, unknown>;
};

type JobRun = typeof jobRuns.$inferSelect;

function isActiveJobRunUniqueConstraintError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const code =
		"code" in error && typeof error.code === "string" ? error.code : undefined;

	return (
		code === "SQLITE_CONSTRAINT_UNIQUE" ||
		error.message.includes("job_runs_active_dedupe_unique_idx") ||
		error.message.includes(
			"UNIQUE constraint failed: job_runs.source_type, job_runs.job_type, job_runs.dedupe_key, job_runs.dedupe_value",
		)
	);
}

export function acquireJobRun(input: AcquireJobRunInput): JobRun {
	const dedupeKey = input.dedupeKey ?? input.jobType;
	const dedupeValue = input.dedupeValue ?? input.jobType;
	const duplicateJobRuns = db
		.select()
		.from(jobRuns)
		.where(
			and(
				eq(jobRuns.sourceType, input.sourceType),
				eq(jobRuns.jobType, input.jobType),
				eq(jobRuns.dedupeKey, dedupeKey),
				eq(jobRuns.dedupeValue, dedupeValue),
				inArray(jobRuns.status, [...NON_TERMINAL_JOB_STATUSES]),
			),
		)
		.all();

	if (duplicateJobRuns.length > 0) {
		throw new Error("This task is already running.");
	}

	const now = new Date();

	try {
		return db
			.insert(jobRuns)
			.values({
				sourceType: input.sourceType,
				jobType: input.jobType,
				displayName: input.displayName,
				dedupeKey,
				dedupeValue,
				status: "running",
				metadata: input.metadata ?? null,
				startedAt: now,
				lastHeartbeatAt: now,
				updatedAt: now,
			})
			.returning()
			.get();
	} catch (error) {
		if (isActiveJobRunUniqueConstraintError(error)) {
			throw new Error("This task is already running.");
		}

		throw error;
	}
}

export function heartbeatJobRun(jobRunId: number): void {
	const now = new Date();

	db.update(jobRuns)
		.set({ lastHeartbeatAt: now, updatedAt: now })
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function updateJobRunProgress(jobRunId: number, progress: string): void {
	const now = new Date();

	db.update(jobRuns)
		.set({ progress, lastHeartbeatAt: now, updatedAt: now })
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function completeJobRun(
	jobRunId: number,
	result: Record<string, unknown>,
): void {
	const now = new Date();

	db.update(jobRuns)
		.set({
			status: "succeeded",
			result,
			error: null,
			finishedAt: now,
			lastHeartbeatAt: now,
			updatedAt: now,
		})
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function failJobRun(jobRunId: number, error: string): void {
	const now = new Date();

	db.update(jobRuns)
		.set({
			status: "failed",
			error,
			finishedAt: now,
			lastHeartbeatAt: now,
			updatedAt: now,
		})
		.where(eq(jobRuns.id, jobRunId))
		.run();
}

export function markStaleJobRuns(now = new Date()): void {
	const staleBefore = new Date(now.getTime() - JOB_STALE_AFTER_MS);

	db.update(jobRuns)
		.set({
			status: "stale",
			error: "Job heartbeat expired before completion.",
			finishedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(jobRuns.status, "running"),
				lt(jobRuns.lastHeartbeatAt, staleBefore),
			),
		)
		.run();
}

export function listActiveJobRuns(): JobRun[] {
	return db
		.select()
		.from(jobRuns)
		.where(inArray(jobRuns.status, [...NON_TERMINAL_JOB_STATUSES]))
		.all();
}
