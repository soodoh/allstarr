import type { Page } from "@playwright/test";
import { waitForHydration } from "./auth";

export default async function navigateTo(
  page: Page,
  baseUrl: string,
  path: string,
): Promise<void> {
  await page.goto(`${baseUrl}${path}`);
  // Use "load" not "networkidle" — SSE connection keeps network active on authenticated pages
  await page.waitForLoadState("load");
  await waitForHydration(page);
}
