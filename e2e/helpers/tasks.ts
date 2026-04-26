import { expect, type Page, type Response } from "@playwright/test";
import navigateTo from "./navigation";

type SerializedNode = {
	t?: number;
	s?: string | number;
	a?: SerializedNode[];
	p?: {
		k?: Array<string | SerializedNode>;
		v?: SerializedNode[];
	};
};

type ScheduledTaskRefetch = {
	id: string;
	lastExecution: string | null;
	lastResult: string | null;
};

function taskNameToId(taskName: string): string {
	return taskName.toLowerCase().replaceAll(/\W+/g, "-").replaceAll(/^-|-$/g, "");
}

function isServerFunctionResponse(
	appUrl: string,
	method: "GET" | "POST",
	startedAt: number,
) {
	return (response: Response): boolean => {
		const request = response.request();
		return (
			request.method() === method &&
			response.url().startsWith(`${appUrl}/_serverFn/`) &&
			request.timing().startTime >= startedAt
		);
	};
}

function readSerializedString(node: SerializedNode | undefined): string | null {
	return node?.t === 1 && typeof node.s === "string" ? node.s : null;
}

function readNullableSerializedString(
	node: SerializedNode | undefined,
): string | null {
	if (node?.t === 2 && node.s === 0) {
		return null;
	}
	return readSerializedString(node);
}

function readTaskFromSerializedNode(
	node: SerializedNode,
	taskId: string,
): ScheduledTaskRefetch | null {
	const keys = node.p?.k;
	const values = node.p?.v;
	if (!keys || !values) {
		return null;
	}

	const idIndex = keys.indexOf("id");
	const lastExecutionIndex = keys.indexOf("lastExecution");
	const lastResultIndex = keys.indexOf("lastResult");
	if (idIndex === -1 || lastExecutionIndex === -1 || lastResultIndex === -1) {
		return null;
	}

	const id = readSerializedString(values[idIndex]);
	if (id !== taskId) {
		return null;
	}

	return {
		id,
		lastExecution: readNullableSerializedString(values[lastExecutionIndex]),
		lastResult: readNullableSerializedString(values[lastResultIndex]),
	};
}

function findTaskInSerializedResponse(
	node: SerializedNode | SerializedNode[] | null,
	taskId: string,
): ScheduledTaskRefetch | null {
	if (!node || typeof node !== "object") {
		return null;
	}

	if (Array.isArray(node)) {
		for (const child of node) {
			const task = findTaskInSerializedResponse(child, taskId);
			if (task) {
				return task;
			}
		}
		return null;
	}

	const task = readTaskFromSerializedNode(node, taskId);
	if (task) {
		return task;
	}

	for (const child of [...(node.a ?? []), ...(node.p?.v ?? [])]) {
		const task = findTaskInSerializedResponse(child, taskId);
		if (task) {
			return task;
		}
	}

	return null;
}

async function responseHasFreshTaskResult(
	response: Response,
	appUrl: string,
	responseStartedAt: number,
	taskStartedAt: number,
	taskId: string,
	expectedResult: "success" | "error",
): Promise<boolean> {
	if (!isServerFunctionResponse(appUrl, "GET", responseStartedAt)(response)) {
		return false;
	}

	try {
		const payload = JSON.parse(await response.text()) as SerializedNode;
		const task = findTaskInSerializedResponse(payload, taskId);
		if (!task?.lastExecution || task.lastResult !== expectedResult) {
			return false;
		}
		return new Date(task.lastExecution).getTime() >= taskStartedAt - 1000;
	} catch {
		return false;
	}
}

export async function triggerScheduledTask(
	page: Page,
	appUrl: string,
	taskName: string,
	options: { expectedStatus?: "Success" | "Error" } = {},
): Promise<void> {
	const expectedStatus = options.expectedStatus ?? "Success";

	await fetch(`${appUrl}/api/__test-reset`, { method: "POST" }).catch(() => {
		/* best-effort reset for stale running-task state */
	});

	await navigateTo(page, appUrl, "/system/tasks");

	const row = page.getByRole("row").filter({ hasText: taskName });
	await expect(row).toBeVisible({ timeout: 10_000 });

	const runButton = row.getByRole("button").last();
	await expect(runButton).toBeEnabled({ timeout: 5_000 });
	const taskId = taskNameToId(taskName);
	let clickStartedAt = Number.POSITIVE_INFINITY;
	const taskResponse = page.waitForResponse(
		(response) => {
			const request = response.request();
			return (
				isServerFunctionResponse(appUrl, "POST", clickStartedAt)(response) &&
				(request.postData() ?? "").includes(taskId)
			);
		},
		{ timeout: 30_000 },
	);

	clickStartedAt = Date.now();
	await runButton.click();
	const response = await taskResponse;
	expect(response.ok()).toBe(true);
	const postTiming = response.request().timing();
	const postResponseAt =
		postTiming.responseEnd !== -1
			? postTiming.startTime + postTiming.responseEnd
			: postTiming.responseStart !== -1
				? postTiming.startTime + postTiming.responseStart
				: Date.now();
	// The invalidated tasks query can start in the same browser tick as the
	// mutation response; keep the cutoff tied to the POST response timing, not
	// the helper's later Date.now() observation.
	const refetchStartedAt = postResponseAt - 250;
	const tasksRefetch = page.waitForResponse(
		(refetchResponse) =>
			responseHasFreshTaskResult(
				refetchResponse,
				appUrl,
				refetchStartedAt,
				clickStartedAt,
				taskId,
				expectedStatus === "Success" ? "success" : "error",
		),
		{ timeout: 30_000 },
	);
	const refetchResponse = await tasksRefetch;
	expect(refetchResponse.ok()).toBe(true);

	await expect(row.getByText(expectedStatus).first()).toBeVisible({
		timeout: 5_000,
	});
}
