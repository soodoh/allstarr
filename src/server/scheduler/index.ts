// oxlint-disable no-console -- Scheduler logs are intentional server-side diagnostics
import { db } from "src/db";
import { scheduledTasks } from "src/db/schema";
import { eq } from "drizzle-orm";
import { getAllTasks, getTask } from "./registry";
import { eventBus } from "../event-bus";
import { getTimers, setTaskExecutor } from "./timers";

// oxlint-disable import/no-unassigned-import -- Side-effect imports register tasks in the registry
import "./tasks/check-health";
import "./tasks/housekeeping";
import "./tasks/backup";
import "./tasks/refresh-metadata";
import "./tasks/rss-sync";
import "./tasks/rescan-folders";
import "./tasks/refresh-downloads";
// oxlint-enable import/no-unassigned-import

let started = false;
const timers = getTimers();
const runningTasks = new Set<string>();

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
          enabled: true,
        })
        .run();
    }
  }
}

async function executeTask(taskId: string): Promise<void> {
  if (runningTasks.has(taskId)) {
    return;
  }

  const task = getTask(taskId);
  if (!task) {
    return;
  }

  runningTasks.add(taskId);
  const start = Date.now();

  try {
    const result = await task.handler();
    const duration = Date.now() - start;

    db.update(scheduledTasks)
      .set({
        lastExecution: new Date(),
        lastDuration: duration,
        lastResult: result.success ? "success" : "error",
        lastMessage: result.message,
      })
      .where(eq(scheduledTasks.id, taskId))
      .run();

    console.log(`[scheduler] ${task.name}: ${result.message} (${duration}ms)`);
    eventBus.emit({ type: "taskUpdated", taskId });
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : "Unknown error";

    db.update(scheduledTasks)
      .set({
        lastExecution: new Date(),
        lastDuration: duration,
        lastResult: "error",
        lastMessage: message,
      })
      .where(eq(scheduledTasks.id, taskId))
      .run();

    console.error(`[scheduler] ${task.name} failed: ${message}`);
    eventBus.emit({ type: "taskUpdated", taskId });
  } finally {
    runningTasks.delete(taskId);
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
  started = true;

  setTaskExecutor((taskId) => void executeTask(taskId));
  seedTasksIfNeeded();
  startTimers();
  console.log(`[scheduler] Started with ${timers.size} task(s)`);
}

export async function runTaskNow(taskId: string): Promise<void> {
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Unknown task: ${taskId}`);
  }
  await executeTask(taskId);
}

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId);
}
