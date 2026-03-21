import type { Page } from "@playwright/test";

export const TEST_USER = {
  name: "Test User",
  email: "test@allstarr.local",
  password: "TestPassword123!",
};

export async function registerUser(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/register`);
  await page.getByLabel("Name").fill(TEST_USER.name);
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /register|sign up/i }).click();
  await page.waitForURL(`${baseUrl}/`);
}

export async function loginUser(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(`${baseUrl}/**`);
}

export async function ensureAuthenticated(
  page: Page,
  baseUrl: string,
): Promise<void> {
  await page.goto(`${baseUrl}/`);
  const url = page.url();
  if (url.includes("/login") || url.includes("/register")) {
    // Try login first, fall back to register
    try {
      await loginUser(page, baseUrl);
    } catch {
      await registerUser(page, baseUrl);
    }
  }
}
