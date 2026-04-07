export type TaskResult = {
	success: boolean;
	message: string;
};

type TaskDefinition = {
	id: string;
	name: string;
	description: string;
	defaultInterval: number; // seconds
	group: "search" | "metadata" | "media" | "maintenance";
	handler: (updateProgress: (message: string) => void) => Promise<TaskResult>;
};

const registry = new Map<string, TaskDefinition>();

export function registerTask(task: TaskDefinition): void {
	registry.set(task.id, task);
}

export function getTask(id: string): TaskDefinition | undefined {
	return registry.get(id);
}

export function getAllTasks(): TaskDefinition[] {
	return [...registry.values()];
}
