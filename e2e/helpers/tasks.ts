import { expect, type Page, type Response } from "@playwright/test";
import navigateTo from "./navigation";

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
	const refetchStartedAt = Date.now();
	const tasksRefetch = page.waitForResponse(
		isServerFunctionResponse(appUrl, "GET", refetchStartedAt),
		{ timeout: 30_000 },
	);
	const refetchResponse = await tasksRefetch;
	expect(refetchResponse.ok()).toBe(true);

	await expect(row.getByText(expectedStatus).first()).toBeVisible({
		timeout: 5_000,
	});
}
