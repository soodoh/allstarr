import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { scheduledTasks } from "src/db/schema";
import { z } from "zod";
import { eventBus } from "./event-bus";
import {
	type JobRunStatus,
	listVisibleScheduledJobRuns,
	NON_TERMINAL_JOB_STATUSES,
} from "./job-runs";
import { requireAdmin, requireAuth } from "./middleware";
import { clearTaskTimer, rescheduleTask } from "./scheduler/timers";

export type ScheduledTask = {
	id: string;
	name: string;
	interval: number;
	lastExecution: string | null;
	lastDuration: number | null;
	lastResult: string | null;
	lastMessage: string | null;
	nextExecution: string | null;
	enabled: boolean;
	isRunning: boolean;
	progress: string | null;
	runStatus: JobRunStatus | null;
	group: string;
};

const JOB_RUN_STATUSES = new Set<string>([
	"queued",
	"running",
	"succeeded",
	"failed",
	"cancelled",
	"stale",
]);

function toJobRunStatus(
	status: string | null | undefined,
): JobRunStatus | null {
	return status && JOB_RUN_STATUSES.has(status)
		? (status as JobRunStatus)
		: null;
}

type VisibleScheduledJobRun = ReturnType<
	typeof listVisibleScheduledJobRuns
>[number];

function isActiveStatus(status: string): boolean {
	return NON_TERMINAL_JOB_STATUSES.includes(
		status as (typeof NON_TERMINAL_JOB_STATUSES)[number],
	);
}

function getRunTimestamp(run: VisibleScheduledJobRun): number {
	return (
		run.updatedAt?.getTime() ??
		run.finishedAt?.getTime() ??
		run.startedAt?.getTime() ??
		run.createdAt?.getTime() ??
		0
	);
}

function shouldUseRun(
	current: VisibleScheduledJobRun | undefined,
	next: VisibleScheduledJobRun,
): boolean {
	if (!current) {
		return true;
	}

	const currentIsActive = isActiveStatus(current.status);
	const nextIsActive = isActiveStatus(next.status);

	if (currentIsActive !== nextIsActive) {
		return nextIsActive;
	}

	return getRunTimestamp(next) > getRunTimestamp(current);
}

export const getScheduledTasksFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		const tasks = db.select().from(scheduledTasks).all();
		const visibleScheduledRunsByTaskId = new Map<
			string,
			VisibleScheduledJobRun
		>();
		for (const run of listVisibleScheduledJobRuns()) {
			if (run.sourceType !== "scheduled") {
				continue;
			}
			const currentRun = visibleScheduledRunsByTaskId.get(run.jobType);
			if (shouldUseRun(currentRun, run)) {
				visibleScheduledRunsByTaskId.set(run.jobType, run);
			}
		}

		return tasks.map((task): ScheduledTask => {
			const visibleRun = visibleScheduledRunsByTaskId.get(task.id);
			const lastExec = task.lastExecution ? task.lastExecution.getTime() : null;
			const nextExec =
				lastExec && task.enabled
					? new Date(lastExec + task.interval * 1000).toISOString()
					: null;

			return {
				id: task.id,
				name: task.name,
				interval: task.interval,
				lastExecution: task.lastExecution
					? task.lastExecution.toISOString()
					: null,
				lastDuration: task.lastDuration,
				lastResult: task.lastResult,
				lastMessage: task.lastMessage,
				nextExecution: nextExec,
				enabled: task.enabled,
				isRunning:
					visibleRun !== undefined && isActiveStatus(visibleRun.status),
				progress:
					visibleRun?.progress ?? visibleRun?.error ?? task.progress ?? null,
				runStatus: toJobRunStatus(visibleRun?.status),
				group: task.group,
			};
		});
	},
);

export const runScheduledTaskFn = createServerFn({ method: "POST" })
	.inputValidator((d: { taskId: string }) => d)
	.handler(async ({ data }) => {
		await requireAdmin();
		const { runTaskNow } = await import("./scheduler");
		await runTaskNow(data.taskId);
		return { success: true };
	});

export const toggleTaskEnabledFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) =>
		z.object({ taskId: z.string(), enabled: z.boolean() }).parse(d),
	)
	.handler(async ({ data }) => {
		await requireAdmin();
		db.update(scheduledTasks)
			.set({ enabled: data.enabled })
			.where(eq(scheduledTasks.id, data.taskId))
			.run();

		if (data.enabled) {
			const task = db
				.select()
				.from(scheduledTasks)
				.where(eq(scheduledTasks.id, data.taskId))
				.get();
			if (task) {
				rescheduleTask(data.taskId, task.interval * 1000);
			}
		} else {
			clearTaskTimer(data.taskId);
		}

		eventBus.emit({ type: "taskUpdated", taskId: data.taskId });
		return { success: true };
	});
