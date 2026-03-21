import { test, expect } from "../fixtures/app";
import { TEST_USER, registerUser } from "../helpers/auth";

test.describe("Auth", () => {
  test("register new account", async ({ page, appUrl }) => {
    await page.goto(`${appUrl}/register`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Name").fill(TEST_USER.name);
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: /create account/i }).click();

    // Should redirect to the authenticated area (bookshelf)
    await page.waitForURL(`${appUrl}/**`);
    expect(page.url()).not.toContain("/register");
    expect(page.url()).not.toContain("/login");
  });

  test("login with valid credentials", async ({ page, appUrl }) => {
    // Register first
    await registerUser(page, appUrl);

    // Log out by clearing cookies and navigating to login
    await page.context().clearCookies();
    await page.goto(`${appUrl}/login`);
    await page.waitForLoadState("networkidle");

    // Login
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to authenticated area
    await page.waitForURL(`${appUrl}/**`);
    expect(page.url()).not.toContain("/login");
  });

  test("login with wrong password", async ({ page, appUrl }) => {
    // Register first
    await registerUser(page, appUrl);

    // Clear cookies to log out
    await page.context().clearCookies();
    await page.goto(`${appUrl}/login`);
    await page.waitForLoadState("networkidle");

    // Attempt login with wrong password
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill("WrongPassword123!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should stay on login page and show error
    await expect(page).toHaveURL(/\/login/);

    // Error toast or message should appear
    await expect(
      page.getByText(/failed|invalid|incorrect|error/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("unauthenticated redirect to login", async ({ page, appUrl }) => {
    // Navigate to a protected route without being logged in
    await page.goto(`${appUrl}/bookshelf`);
    await page.waitForLoadState("networkidle");

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("session persistence after reload", async ({ page, appUrl }) => {
    // Register and authenticate
    await registerUser(page, appUrl);

    // Reload the page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should still be authenticated (not redirected to login)
    expect(page.url()).not.toContain("/login");
    expect(page.url()).not.toContain("/register");
  });

  test("logout redirects to login", async ({ page, appUrl }) => {
    // Register and authenticate
    await registerUser(page, appUrl);

    // Clear cookies to simulate logout
    await page.context().clearCookies();

    // Try to access a protected route
    await page.goto(`${appUrl}/bookshelf`);
    await page.waitForLoadState("networkidle");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    // Verify subsequent protected route access also redirects
    await page.goto(`${appUrl}/settings`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/login/);
  });
});
