import { defineConfig } from "@standard-config/oxlint";

export default defineConfig({
  react: true,
  ignorePatterns: ["node_modules/**", ".output/**", "src/routeTree.gen.ts"],
  rules: {},
  overrides: [
    {
      // TanStack Router requires `export const Route` as a named export.
      // DB schema files use named exports consumed by Drizzle ORM.
      // Server function files export named server functions.
      // Utility files (auth, db, router) export named constants used everywhere.
      files: [
        "src/routes/**",
        "src/db/**",
        "src/lib/auth.ts",
        "src/lib/utils.ts",
        "src/router.tsx",
        "src/server/dashboard.ts",
        "src/server/history.ts",
        "src/hooks/use-mobile.ts",
      ],
      rules: {
        "import/prefer-default-export": "off",
      },
    },
    {
      // TanStack Router uses camelCase param names in filenames ($bookId, $authorId)
      // and some components use PascalCase (DefaultCatchBoundary, NotFound).
      files: [
        "src/routes/**/$*.tsx",
        "src/components/DefaultCatchBoundary.tsx",
        "src/components/NotFound.tsx",
      ],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
  ],
});
