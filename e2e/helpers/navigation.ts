import type { Page } from "@playwright/test";

export default async function navigateTo(
  page: Page,
  baseUrl: string,
  path: string,
): Promise<void> {
  await page.goto(`${baseUrl}${path}`);
  await page.waitForLoadState("networkidle");
}
