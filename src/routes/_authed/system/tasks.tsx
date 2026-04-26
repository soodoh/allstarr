import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	CheckCircle,
	Clock,
	Loader2,
	Play,
	XCircle,
} from "lucide-react";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import PageHeader from "src/components/shared/page-header";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Switch from "src/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "src/components/ui/tooltip";
import { useRunTask, useToggleTaskEnabled } from "src/hooks/mutations/tasks";
import { scheduledTasksQuery } from "src/lib/queries";
import type { ScheduledTask } from "src/server/tasks";

const GROUP_ORDER = ["search", "metadata", "media", "maintenance"] as const;
const GROUP_LABELS: Record<string, string> = {
	search: "Search",
	metadata: "Metadata",
	media: "Media Management",
	maintenance: "Maintenance",
};

export const Route = createFileRoute("/_authed/system/tasks")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(scheduledTasksQuery()),
	component: TasksPage,
	pendingComponent: () => <TableSkeleton />,
});

function plural(n: number, unit: string): string {
	return n === 1 ? `${n} ${unit}` : `${n} ${unit}s`;
}

function formatInterval(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		return plural(Math.round(seconds / 60), "minute");
	}
	if (seconds < 86_400) {
		return plural(Math.round(seconds / 3600), "hour");
	}
	return plural(Math.round(seconds / 86_400), "day");
}

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(isoString: string): string {
	const date = new Date(isoString);
	const now = Date.now();
	const diffMs = now - date.getTime();

	if (diffMs < 0) {
		const absDiff = Math.abs(diffMs);
		if (absDiff < 60_000) {
			return "in < 1 minute";
		}
		if (absDiff < 3_600_000) {
			return `in ${plural(Math.round(absDiff / 60_000), "minute")}`;
		}
		return `in ${plural(Math.round(absDiff / 3_600_000), "hour")}`;
	}

	if (diffMs < 60_000) {
		return "just now";
	}
	if (diffMs < 3_600_000) {
		return `${plural(Math.round(diffMs / 60_000), "minute")} ago`;
	}
	if (diffMs < 86_400_000) {
		return `${plural(Math.round(diffMs / 3_600_000), "hour")} ago`;
	}
	return `${plural(Math.round(diffMs / 86_400_000), "day")} ago`;
}

function StatusBadge({ task }: { task: ScheduledTask }) {
	if (task.runStatus === "stale") {
		return (
			<Badge variant="destructive" className="gap-1">
				<AlertTriangle className="h-3 w-3" />
				Stale
			</Badge>
		);
	}

	if (task.isRunning) {
		return (
			<Badge variant="outline" className="gap-1">
				<Loader2 className="h-3 w-3 animate-spin" />
				Running
			</Badge>
		);
	}

	if (!task.lastResult) {
		return (
			<Badge variant="secondary" className="gap-1">
				<Clock className="h-3 w-3" />
				Pending
			</Badge>
		);
	}

	if (task.lastResult === "success") {
		return (
			<Badge
				variant="outline"
				className="gap-1 border-green-500/50 text-green-500"
			>
				<CheckCircle className="h-3 w-3" />
				Success
			</Badge>
		);
	}

	return (
		<Badge variant="destructive" className="gap-1">
			<XCircle className="h-3 w-3" />
			Error
		</Badge>
	);
}

function TaskMessage({ task }: { task: ScheduledTask }) {
	if (task.isRunning && task.progress) {
		return (
			<div className="text-xs text-muted-foreground mt-0.5">
				{task.progress}
			</div>
		);
	}

	if (task.lastMessage) {
		return (
			<div className="text-xs text-muted-foreground mt-0.5">
				{task.lastMessage}
			</div>
		);
	}

	return null;
}

function TaskRow({ task }: { task: ScheduledTask }) {
	const runTask = useRunTask();
	const toggleEnabled = useToggleTaskEnabled();

	return (
		<TableRow className={task.enabled ? undefined : "opacity-50"}>
			<TableCell>
				<Switch
					size="sm"
					checked={task.enabled}
					onCheckedChange={(enabled: boolean) =>
						toggleEnabled.mutate({ taskId: task.id, enabled })
					}
				/>
			</TableCell>
			<TableCell>
				<div>
					<div className="font-medium">{task.name}</div>
					<TaskMessage task={task} />
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatInterval(task.interval)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{task.lastExecution ? formatRelativeTime(task.lastExecution) : "Never"}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{task.lastDuration !== null && task.lastDuration !== undefined
					? formatDuration(task.lastDuration)
					: "-"}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{task.nextExecution ? formatRelativeTime(task.nextExecution) : "Never"}
			</TableCell>
			<TableCell>
				<StatusBadge task={task} />
			</TableCell>
			<TableCell>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8 cursor-pointer"
							disabled={task.isRunning || runTask.isPending}
							onClick={() => runTask.mutate(task.id)}
						>
							{task.isRunning || runTask.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Play className="h-4 w-4" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>Run now</TooltipContent>
				</Tooltip>
			</TableCell>
		</TableRow>
	);
}

function TaskGroup({
	label,
	tasks,
}: {
	label: string;
	tasks: ScheduledTask[];
}) {
	return (
		<Card>
			<CardHeader className="pb-0">
				<CardTitle className="text-base">{label}</CardTitle>
			</CardHeader>
			<CardContent className="p-0 pt-2">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-12" />
							<TableHead>Name</TableHead>
							<TableHead>Interval</TableHead>
							<TableHead>Last Execution</TableHead>
							<TableHead>Duration</TableHead>
							<TableHead>Next Execution</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{tasks.map((task) => (
							<TaskRow key={task.id} task={task} />
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function TasksPage() {
	const { data: tasks } = useSuspenseQuery(scheduledTasksQuery());

	const grouped = new Map<string, ScheduledTask[]>();
	for (const task of tasks) {
		const group = task.group;
		if (!grouped.has(group)) {
			grouped.set(group, []);
		}
		grouped.get(group)?.push(task);
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Tasks"
				description="Scheduled background tasks and their execution status."
			/>

			{GROUP_ORDER.map((groupKey) => {
				const groupTasks = grouped.get(groupKey);
				if (!groupTasks || groupTasks.length === 0) {
					return null;
				}
				return (
					<TaskGroup
						key={groupKey}
						label={GROUP_LABELS[groupKey] ?? groupKey}
						tasks={groupTasks}
					/>
				);
			})}

			{/* Render any tasks with unknown groups at the end */}
			{[...grouped.entries()]
				.filter(
					([key]) => !GROUP_ORDER.includes(key as (typeof GROUP_ORDER)[number]),
				)
				.map(([key, groupTasks]) => (
					<TaskGroup
						key={key}
						label={GROUP_LABELS[key] ?? key}
						tasks={groupTasks}
					/>
				))}
		</div>
	);
}
