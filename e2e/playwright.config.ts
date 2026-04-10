import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  reporter: [
    ["list"],
    ...(process.env.COLLECT_COVERAGE === "true"
      ? [
          [
            "monocart-reporter",
            {
              coverage: {
                reports: ["v8", "raw", "console-summary"],
                outputDir: "coverage/e2e",
              },
            },
          ] as const,
        ]
      : []),
  ],
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
});
