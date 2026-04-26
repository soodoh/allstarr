import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { eventBus } from "./event-bus";
import {
	acquireJobRun,
	completeJobRun,
	failJobRun,
	listActiveJobRuns,
	updateJobRunProgress,
} from "./job-runs";
import { logError } from "./logger";
import { requireAuth } from "./middleware";

export type CommandHandler = (
	body: Record<string, unknown>,
	updateProgress: (message: string) => void,
	setTitle: (title: string) => void,
) => Promise<Record<string, unknown>>;

type SubmitCommandOptions = {
	commandType: string;
	name: string;
	body: Record<string, unknown>;
	/** Field name in body used as the unique key for duplicate detection */
	dedupeKey: string;
	/** If set, check this scheduled task ID for batch overlap */
	batchTaskId?: string;
	handler: CommandHandler;
};

function checkBatchOverlap(batchTaskId: string): void {
	const hasActiveBatchRun = listActiveJobRuns().some(
		(run) => run.sourceType === "scheduled" && run.jobType === batchTaskId,
	);

	if (hasActiveBatchRun) {
		throw new Error(
			"A batch metadata refresh is already running. Wait for it to complete or check the Tasks page for progress.",
		);
	}
}

async function doWork(
	commandId: number,
	commandType: string,
	handler: CommandHandler,
	body: Record<string, unknown>,
): Promise<void> {
	let title = "";

	const setTitle = (t: string): void => {
		title = t;
	};

	const updateProgress = (message: string): void => {
		const progress = title ? `${title} — ${message}` : message;
		updateJobRunProgress(commandId, progress);
		eventBus.emit({ type: "commandProgress", commandId, progress });
	};

	try {
		const result = await handler(body, updateProgress, setTitle);
		completeJobRun(commandId, result);
		eventBus.emit({
			type: "commandCompleted",
			commandId,
			commandType,
			result,
			title,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logError("command", `${commandType} #${commandId} failed`, error);
		failJobRun(commandId, message);
		eventBus.emit({
			type: "commandFailed",
			commandId,
			commandType,
			error: message,
			title,
		});
	}
}

export function submitCommand(opts: SubmitCommandOptions): {
	commandId: number;
} {
	const { commandType, name, body, dedupeKey, batchTaskId, handler } = opts;

	if (batchTaskId) {
		checkBatchOverlap(batchTaskId);
	}

	const dedupeValue = body[dedupeKey];
	const row = acquireJobRun({
		sourceType: "command",
		jobType: commandType,
		displayName: name,
		dedupeKey,
		dedupeValue: dedupeValue === undefined ? randomUUID() : String(dedupeValue),
		metadata: { body, batchTaskId },
	});

	// Fire and forget — intentionally not awaited
	void doWork(row.id, commandType, handler, body).catch((error) =>
		logError("command", `Uncaught error in ${commandType} #${row.id}`, error),
	);

	return { commandId: row.id };
}

// Server function to fetch active commands (used for SSE reconnection)
export const getActiveCommandsFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();
		const rows = listActiveJobRuns().filter(
			(row) => row.sourceType === "command",
		);

		return rows.map((row) => {
			const metadata =
				row.metadata && typeof row.metadata === "object" ? row.metadata : {};
			const body =
				"body" in metadata &&
				metadata.body !== null &&
				typeof metadata.body === "object" &&
				!Array.isArray(metadata.body)
					? (metadata.body as Record<string, never>)
					: {};

			return {
				id: row.id,
				commandType: row.jobType,
				name: row.displayName,
				progress: row.progress,
				body,
			};
		});
	},
);
