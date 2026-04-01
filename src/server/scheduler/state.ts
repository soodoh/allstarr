const runningTasks = new Set<string>();

export function isTaskRunning(taskId: string): boolean {
	return runningTasks.has(taskId);
}

export function markTaskRunning(taskId: string): void {
	runningTasks.add(taskId);
}

export function markTaskComplete(taskId: string): void {
	runningTasks.delete(taskId);
}

/** Clear stale running-task state (for E2E test isolation). */
export function clearRunningTasks(): void {
	runningTasks.clear();
}
