import { defineConfig } from "@standard-config/oxlint";

export default defineConfig({
  react: true,
  ignorePatterns: ["node_modules/**", ".output/**", "src/routeTree.gen.ts"],
  rules: {
    "typescript/no-restricted-types": "off",
    "typescript-eslint/no-restricted-types": "off",
    "eslint/no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "react",
            importNames: ["default"],
            message: "Use named imports from 'react' instead",
          },
        ],
      },
    ],
  },
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
      // Data-mapping files have inherently high complexity from field-by-field
      // API response mapping with many nullable fields.
      files: [
        "src/server/hardcover/import-queries.ts",
        "src/server/search.ts",
        "src/components/hardcover/book-preview-modal.tsx",
      ],
      rules: {
        "eslint/complexity": ["error", { max: 25 }],
      },
    },
    {
      // List pages with view toggling, mass edit, filtering, and search
      // have inherently high cyclomatic complexity.
      files: [
        "src/routes/_authed/movies/index.tsx",
        "src/routes/_authed/tv/index.tsx",
      ],
      rules: {
        "eslint/complexity": ["error", { max: 25 }],
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
    {
      // Server-side API routes use console.log for request debugging.
      files: ["src/routes/api/**"],
      rules: {
        "eslint/no-console": "off",
      },
    },
  ],
});
