import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { scheduledTasks } from "src/db/schema";
import { requireAuth } from "./middleware";
import { runTaskNow, isTaskRunning } from "./scheduler";

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
      };
    });
  },
);

export const runScheduledTaskFn = createServerFn({ method: "POST" })
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    await runTaskNow(data.taskId);
    return { success: true };
  });
