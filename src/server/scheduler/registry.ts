export type TaskResult = {
  success: boolean;
  message: string;
};

export type TaskDefinition = {
  id: string;
  name: string;
  description: string;
  defaultInterval: number; // seconds
  handler: () => Promise<TaskResult>;
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
