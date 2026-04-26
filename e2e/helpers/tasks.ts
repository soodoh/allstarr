import { expect, type Page } from "@playwright/test";
import navigateTo from "./navigation";

export async function triggerScheduledTask(
	page: Page,
	appUrl: string,
	taskName: string,
): Promise<void> {
	await fetch(`${appUrl}/api/__test-reset`, { method: "POST" }).catch(() => {
		/* best-effort reset for stale running-task state */
	});

	await navigateTo(page, appUrl, "/system/tasks");

	const row = page.getByRole("row").filter({ hasText: taskName });
	await expect(row).toBeVisible({ timeout: 10_000 });

	const runButton = row.getByRole("button").last();
	await expect(runButton).toBeEnabled({ timeout: 5_000 });
	await runButton.click();

	await expect(async () => {
		const status = await row
			.getByText(/Running|Success|Error/)
			.first()
			.textContent();
		expect(status).not.toBe("Running");
	}).toPass({ timeout: 30_000 });

	await expect(row.getByText(/Success|Error/).first()).toBeVisible({
		timeout: 5_000,
	});
}
