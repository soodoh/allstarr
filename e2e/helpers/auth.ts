import type { Page, Locator } from "@playwright/test";

export const TEST_USER = {
  name: "Test User",
  email: "test@allstarr.local",
  password: "TestPassword123!",
};

/**
 * Wait for React to hydrate the page.
 * Checks for React's internal __reactFiber property on the form element.
 * This ensures event handlers are attached before we interact with the form.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      if (!form) {
        return false;
      }
      return Object.keys(form).some(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
      );
    },
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Fill an input and verify the value took effect.
 * Retries if React hydration wipes the value (SSR race condition).
 */
async function fillInput(locator: Locator, value: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await locator.fill(value);
    const actual = await locator.inputValue();
    if (actual === value) {
      return;
    }
    await locator.page().waitForTimeout(500);
  }
}

export async function registerUser(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/register`);
  await waitForHydration(page);
  await fillInput(page.getByLabel("Name"), TEST_USER.name);
  await fillInput(page.getByLabel("Email"), TEST_USER.email);
  await fillInput(page.getByLabel("Password"), TEST_USER.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/register") && !url.pathname.includes("/login"),
    { timeout: 15_000 },
  );
}

export async function loginUser(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  await waitForHydration(page);
  await fillInput(page.getByLabel("Email"), TEST_USER.email);
  await fillInput(page.getByLabel("Password"), TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/login") && !url.pathname.includes("/register"),
    { timeout: 15_000 },
  );
}

export async function ensureAuthenticated(
  page: Page,
  baseUrl: string,
): Promise<void> {
  await page.goto(`${baseUrl}/`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);

  const currentUrl = page.url();

  if (!currentUrl.includes("/login") && !currentUrl.includes("/register")) {
    return;
  }

  if (currentUrl.includes("/login")) {
    try {
      await waitForHydration(page);
      await fillInput(page.getByLabel("Email"), TEST_USER.email);
      await fillInput(page.getByLabel("Password"), TEST_USER.password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(
        (url) =>
          !url.pathname.includes("/login") &&
          !url.pathname.includes("/register"),
        { timeout: 10_000 },
      );
      return;
    } catch {
      // Login failed — register instead
    }
  }

  await page.goto(`${baseUrl}/register`);
  await waitForHydration(page);
  await fillInput(page.getByLabel("Name"), TEST_USER.name);
  await fillInput(page.getByLabel("Email"), TEST_USER.email);
  await fillInput(page.getByLabel("Password"), TEST_USER.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/register") && !url.pathname.includes("/login"),
    { timeout: 15_000 },
  );
}

export { fillInput, waitForHydration };
