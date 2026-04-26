import { eq } from "drizzle-orm";
import { db } from "src/db";
import { scheduledTasks } from "src/db/schema";
import { eventBus } from "../event-bus";
import {
	acquireJobRun,
	completeJobRun,
	failJobRun,
	markStaleJobRuns,
	updateJobRunProgress,
} from "../job-runs";
import { logError, logInfo } from "../logger";
import { getAllTasks, getTask } from "./registry";
import { getTimers, setTaskExecutor } from "./timers";
import "./tasks/check-health";
import "./tasks/housekeeping";
import "./tasks/backup";
import "./tasks/refresh-metadata";
import "./tasks/rss-sync";
import "./tasks/rescan-folders";
import "./tasks/refresh-downloads";
import "./tasks/refresh-tmdb-metadata";
import "./tasks/search-missing";
import "./tasks/refresh-series-metadata";

// oxlint-enable import/no-unassigned-import

let started = false;
const timers = getTimers();

function recoverStaleScheduledRuns(): void {
	const staleRuns = markStaleJobRuns();

	for (const run of staleRuns) {
		if (run.sourceType !== "scheduled") {
			continue;
		}

		db.update(scheduledTasks)
			.set({ progress: null })
			.where(eq(scheduledTasks.id, run.jobType))
			.run();
	}
}

function seedTasksIfNeeded(): void {
	const existing = db.select().from(scheduledTasks).all();
	const existingIds = new Set(existing.map((t) => t.id));

	for (const task of getAllTasks()) {
		if (!existingIds.has(task.id)) {
			db.insert(scheduledTasks)
				.values({
					id: task.id,
					name: task.name,
					interval: task.defaultInterval,
					group: task.group,
					enabled: true,
				})
				.run();
		}
	}
}

async function executeTask(taskId: string): Promise<void> {
	const task = getTask(taskId);
	if (!task) {
		return;
	}

	recoverStaleScheduledRuns();

	let run: ReturnType<typeof acquireJobRun>;
	try {
		run = acquireJobRun({
			sourceType: "scheduled",
			jobType: task.id,
			displayName: task.name,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "This task is already running."
		) {
			return;
		}

		throw error;
	}

	const start = Date.now();

	try {
		const updateProgress = (message: string): void => {
			updateJobRunProgress(run.id, message);
			db.update(scheduledTasks)
				.set({ progress: message })
				.where(eq(scheduledTasks.id, taskId))
				.run();
			eventBus.emit({ type: "taskUpdated", taskId });
		};

		const result = await task.handler(updateProgress);
		const duration = Date.now() - start;

		db.update(scheduledTasks)
			.set({
				progress: null,
				lastExecution: new Date(),
				lastDuration: duration,
				lastResult: result.success ? "success" : "error",
				lastMessage: result.message,
			})
			.where(eq(scheduledTasks.id, taskId))
			.run();

		if (result.success) {
			completeJobRun(run.id, result as Record<string, unknown>);
		} else {
			failJobRun(run.id, result.message);
		}
		logInfo("scheduler", `${task.name}: ${result.message} (${duration}ms)`);
		eventBus.emit({ type: "taskUpdated", taskId });
	} catch (error) {
		const duration = Date.now() - start;
		const message = error instanceof Error ? error.message : "Unknown error";

		db.update(scheduledTasks)
			.set({
				progress: null,
				lastExecution: new Date(),
				lastDuration: duration,
				lastResult: "error",
				lastMessage: message,
			})
			.where(eq(scheduledTasks.id, taskId))
			.run();

		failJobRun(run.id, message);
		logError("scheduler", `${task.name} failed: ${message}`, error);
		eventBus.emit({ type: "taskUpdated", taskId });
	}
}

function startTimers(): void {
	const dbTasks = db.select().from(scheduledTasks).all();

	for (const dbTask of dbTasks) {
		if (!dbTask.enabled) {
			continue;
		}

		const task = getTask(dbTask.id);
		if (!task) {
			continue;
		}

		const intervalMs = dbTask.interval * 1000;

		// Calculate delay until next execution
		let delay = intervalMs;
		if (dbTask.lastExecution) {
			const elapsed = Date.now() - dbTask.lastExecution.getTime();
			delay = Math.max(0, intervalMs - elapsed);
		}

		// Schedule first run after delay, then repeat at interval
		const timeoutId = setTimeout(() => {
			void executeTask(dbTask.id);
			const intervalId = setInterval(
				() => void executeTask(dbTask.id),
				intervalMs,
			);
			timers.set(dbTask.id, intervalId);
		}, delay);

		// Store timeout as timer (will be replaced by interval after first run)
		timers.set(
			dbTask.id,
			timeoutId as unknown as ReturnType<typeof setInterval>,
		);
	}
}

export function ensureSchedulerStarted(): void {
	if (started) {
		return;
	}

	recoverStaleScheduledRuns();
	seedTasksIfNeeded();
	setTaskExecutor((taskId) => void executeTask(taskId));
	startTimers();
	started = true;
	logInfo("scheduler", `Started with ${timers.size} task(s)`);
}

export async function runTaskNow(taskId: string): Promise<void> {
	const task = getTask(taskId);
	if (!task) {
		throw new Error(`Unknown task: ${taskId}`);
	}
	await executeTask(taskId);
}
