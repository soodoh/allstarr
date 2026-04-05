import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { scheduledTasks } from "src/db/schema";
import { z } from "zod";
import { eventBus } from "./event-bus";
import { requireAdmin, requireAuth } from "./middleware";
import { isTaskRunning } from "./scheduler/state";
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
	group: string;
};

export const getScheduledTasksFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		const tasks = db.select().from(scheduledTasks).all();

		return tasks.map((task): ScheduledTask => {
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
				isRunning: isTaskRunning(task.id),
				progress: task.progress ?? null,
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
