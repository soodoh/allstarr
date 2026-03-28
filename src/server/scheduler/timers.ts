/**
 * Shared timer state for the scheduler.
 * Extracted to avoid circular imports between scheduler/index.ts and task files.
 */

const timers = new Map<string, ReturnType<typeof setInterval>>();
let taskExecutor: ((taskId: string) => void) | null = null;

/** Called once by scheduler/index.ts to wire up the executor */
export function setTaskExecutor(fn: (taskId: string) => void): void {
  taskExecutor = fn;
}

export function getTimers(): Map<string, ReturnType<typeof setInterval>> {
  return timers;
}

export function rescheduleTask(taskId: string, intervalMs: number): void {
  const existingTimer = timers.get(taskId);
  if (existingTimer) {
    clearInterval(existingTimer);
    clearTimeout(existingTimer as unknown as ReturnType<typeof setTimeout>);
  }
  if (!taskExecutor) {
    throw new Error("Task executor not initialized");
  }
  const executor = taskExecutor;
  const intervalId = setInterval(() => executor(taskId), intervalMs);
  timers.set(taskId, intervalId);
}

export function clearTaskTimer(taskId: string): void {
  const existing = timers.get(taskId);
  if (existing) {
    clearInterval(existing);
    timers.delete(taskId);
  }
}
