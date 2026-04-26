import { expect, type Page } from "@playwright/test";
import navigateTo from "./navigation";

function taskNameToId(taskName: string): string {
	return taskName.toLowerCase().replaceAll(/\W+/g, "-").replaceAll(/^-|-$/g, "");
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
	const taskResponse = page.waitForResponse(
		(response) => {
			const request = response.request();
			return (
				request.method() === "POST" &&
				response.url().startsWith(`${appUrl}/_serverFn/`) &&
				(request.postData() ?? "").includes(taskId)
			);
		},
		{ timeout: 30_000 },
	);

	await runButton.click();
	const response = await taskResponse;
	expect(response.ok()).toBe(true);

	await expect(row.getByText(expectedStatus).first()).toBeVisible({
		timeout: 5_000,
	});
}
