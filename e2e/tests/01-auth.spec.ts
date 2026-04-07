/* eslint-disable jest/no-conditional-in-test */
import { test, expect } from "../fixtures/app";
import {
  TEST_USER,
  ensureAuthenticated,
  fillInput,
  submitAccountForm,
  waitForHydration,
} from "../helpers/auth";

test.describe("Auth", () => {
  test("create initial admin account during setup", async ({ page, appUrl }) => {
    await page.goto(`${appUrl}/setup`);
    await waitForHydration(page);

    await fillInput(page.getByLabel("Name"), TEST_USER.name);
    await fillInput(page.getByLabel("Email"), TEST_USER.email);
    await fillInput(page.getByLabel("Password"), TEST_USER.password);
    await submitAccountForm(page);

    expect(page.url()).not.toContain("/setup");
  });

  test("login with valid credentials", async ({ page, appUrl }) => {
    await ensureAuthenticated(page, appUrl);

    await page.context().clearCookies();
    await page.goto(`${appUrl}/login`);
    await waitForHydration(page);

    await fillInput(page.getByLabel("Email"), TEST_USER.email);
    await fillInput(page.getByLabel("Password"), TEST_USER.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 15_000,
    });
    expect(page.url()).not.toContain("/login");
  });

  test("login with wrong password", async ({ page, appUrl }) => {
    await ensureAuthenticated(page, appUrl);

    await page.context().clearCookies();
    await page.goto(`${appUrl}/login`);
    await waitForHydration(page);

    await fillInput(page.getByLabel("Email"), TEST_USER.email);
    await fillInput(page.getByLabel("Password"), "WrongPassword123!");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/login/);

    await expect(
      page.getByText(/failed|invalid|incorrect|error/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("unauthenticated redirect to login", async ({ page, appUrl }) => {
    await page.goto(`${appUrl}/books`);
    await page.waitForLoadState("load");
    await expect(page).toHaveURL(/\/login/);
  });

  test("session persistence after reload", async ({ page, appUrl }) => {
    await ensureAuthenticated(page, appUrl);

    await page.reload();
    await page.waitForLoadState("load");

    expect(page.url()).not.toContain("/login");
    expect(page.url()).not.toContain("/register");
  });

  test("logout redirects to login", async ({ page, appUrl }) => {
    await ensureAuthenticated(page, appUrl);

    await page.context().clearCookies();
    await page.goto(`${appUrl}/books`);
    await page.waitForLoadState("load");
    await expect(page).toHaveURL(/\/login/);
  });
});
