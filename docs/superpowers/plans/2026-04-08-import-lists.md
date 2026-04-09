# Import Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the exclusions-only import-lists page with a real import-list platform that supports IMDb, Trakt, and Plex list sync for movies and TV while preserving the existing exclusions workflow.

**Architecture:** Build a provider-agnostic import-list core around persisted list configuration, sync runs, normalized candidates, and a conservative matching/import service. Keep provider adapters thin, reuse existing movie/show add flows for confident imports, and surface the new capability through a rebuilt settings route that still exposes the current exclusions tab.

**Tech Stack:** Bun, TypeScript, TanStack Start server functions, TanStack Query, Drizzle ORM with SQLite migrations, Vitest, Playwright, Biome

---

## File Structure

- Create `src/db/schema/import-lists.ts`
  Defines `importLists`, `importListSyncRuns`, and `importListCandidates`.
- Modify `src/db/schema/index.ts`
  Re-export the new schema module.
- Create `drizzle/0003_import_lists.sql`
  Adds the three import-list tables and indexes.
- Create `src/server/import-lists/config.ts`
  Provider/media capability matrix plus provider config schemas.
- Create `src/server/import-lists/types.ts`
  Shared provider, candidate, match-status, and sync-result types.
- Create `src/server/import-lists/registry.ts`
  Provider registry used by sync code and server functions.
- Create `src/server/import-lists/providers/imdb.ts`
  IMDb fetch + normalize adapter.
- Create `src/server/import-lists/providers/trakt.ts`
  Trakt fetch + normalize adapter.
- Create `src/server/import-lists/providers/plex.ts`
  Plex fetch + normalize adapter.
- Create `src/server/import-lists/matcher.ts`
  Candidate matching and classification logic.
- Create `src/server/import-lists/import-actions.ts`
  Thin wrappers that translate import-list defaults into movie/show add requests.
- Create `src/server/import-lists/service.ts`
  End-to-end sync pipeline, candidate persistence, and auto-import behavior.
- Create `src/server/import-lists.ts`
  CRUD, candidate review, and manual sync server functions.
- Modify `src/lib/validators.ts`
  Add create/update/sync/review schemas for import lists.
- Modify `src/lib/query-keys.ts`
  Add import-list query keys.
- Create `src/lib/queries/import-lists.ts`
  Query factories for list rows, detail, runs, and candidates.
- Modify `src/lib/queries/index.ts`
  Re-export import-list query factories.
- Create `src/hooks/mutations/import-lists.ts`
  Create/update/delete/manual-sync mutations.
- Modify `src/hooks/mutations/index.ts`
  Re-export the new import-list mutations.
- Create `src/server/scheduler/tasks/sync-import-lists.ts`
  Scheduled automation entrypoint.
- Modify `src/server/scheduler/index.ts`
  Register the new task.
- Modify `src/routes/_authed/settings/import-lists.tsx`
  Replace exclusions-only page with tabbed import-list management UI.
- Create `src/components/settings/import-lists/import-list-list.tsx`
  Settings table for configured lists.
- Create `src/components/settings/import-lists/import-list-form.tsx`
  Provider-aware create/edit dialog.
- Create `src/components/settings/import-lists/import-list-review-table.tsx`
  Candidate review surface.
- Create `src/components/settings/import-lists/import-list-exclusions-tab.tsx`
  Move current exclusions UI into a reusable tab component.
- Create `src/server/__tests__/import-lists/config.test.ts`
  Validates provider/media constraints.
- Create `src/server/__tests__/import-lists/server.test.ts`
  CRUD server-function coverage.
- Create `src/server/__tests__/import-lists/providers.test.ts`
  Provider normalization fixture coverage.
- Create `src/server/__tests__/import-lists/service.test.ts`
  Matching, dedupe, and auto-import coverage.
- Create `src/server/__tests__/import-lists/scheduler.test.ts`
  Scheduler/manual-sync path coverage.
- Create `e2e/tests/03-import-lists.spec.ts`
  Browser-level settings workflow coverage.

### Task 1: Add The Import-List Domain Model, Provider Capabilities, And Validation

**Files:**
- Create: `src/db/schema/import-lists.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/lib/validators.ts`
- Create: `src/server/import-lists/config.ts`
- Create: `drizzle/0003_import_lists.sql`
- Test: `src/server/__tests__/import-lists/config.test.ts`

- [ ] **Step 1: Write the failing provider-capability test**

Create `src/server/__tests__/import-lists/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	createImportListSchema,
	updateImportListSchema,
} from "src/lib/validators";

describe("import-list config validation", () => {
	it("rejects unsupported provider media types", () => {
		expect(() =>
			createImportListSchema.parse({
				name: "IMDb Books",
				provider: "imdb",
				mediaTypes: ["ebook"],
				mode: "review-only",
				enabled: true,
				config: { listId: "ls123456789" },
			}),
		).toThrow(/does not support ebook/i);
	});

	it("allows movie and tv media types for Trakt", () => {
		expect(
			createImportListSchema.parse({
				name: "Trakt Watchlist",
				provider: "trakt",
				mediaTypes: ["movie", "tv"],
				mode: "auto-import",
				enabled: true,
				config: {
					username: "alice",
					listSlug: "watchlist",
					accessToken: "token-1",
				},
			}),
		).toMatchObject({
			provider: "trakt",
			mediaTypes: ["movie", "tv"],
		});
	});

	it("requires ids on update", () => {
		expect(() =>
			updateImportListSchema.parse({
				name: "Plex",
				provider: "plex",
				mediaTypes: ["movie"],
				mode: "review-only",
				enabled: true,
				config: { serverUrl: "https://plex.local", token: "x", libraryId: "1" },
			}),
		).toThrow(/id/i);
	});
});
```

- [ ] **Step 2: Run the test to verify the missing schema fails**

Run: `bunx vitest run src/server/__tests__/import-lists/config.test.ts`

Expected: FAIL with missing `createImportListSchema` / `updateImportListSchema` exports.

- [ ] **Step 3: Add provider capability metadata and provider config schemas**

Create `src/server/import-lists/config.ts`:

```ts
import { z } from "zod";

export const importListProviderEnum = z.enum(["imdb", "trakt", "plex"]);
export const importListModeEnum = z.enum(["auto-import", "review-only"]);
export const importListMediaTypeEnum = z.enum(["movie", "tv", "ebook", "audiobook"]);

const imdbConfigSchema = z.object({
	listId: z.string().min(1),
});

const traktConfigSchema = z.object({
	username: z.string().min(1),
	listSlug: z.string().min(1),
	accessToken: z.string().min(1),
});

const plexConfigSchema = z.object({
	serverUrl: z.string().url(),
	token: z.string().min(1),
	libraryId: z.string().min(1),
});

export const providerCapabilities = {
	imdb: {
		mediaTypes: ["movie", "tv"] as const,
		configSchema: imdbConfigSchema,
	},
	trakt: {
		mediaTypes: ["movie", "tv"] as const,
		configSchema: traktConfigSchema,
	},
	plex: {
		mediaTypes: ["movie", "tv"] as const,
		configSchema: plexConfigSchema,
	},
} as const;

export function assertProviderMediaTypes(
	provider: keyof typeof providerCapabilities,
	mediaTypes: readonly string[],
) {
	const supported = new Set(providerCapabilities[provider].mediaTypes);
	for (const mediaType of mediaTypes) {
		if (!supported.has(mediaType as never)) {
			throw new Error(`${provider} does not support ${mediaType}`);
		}
	}
}
```

- [ ] **Step 4: Add shared import-list validators**

Update `src/lib/validators.ts`:

```ts
import {
	assertProviderMediaTypes,
	importListMediaTypeEnum,
	importListModeEnum,
	importListProviderEnum,
	providerCapabilities,
} from "src/server/import-lists/config";

const importListBaseSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		provider: importListProviderEnum,
		mediaTypes: z.array(importListMediaTypeEnum).min(1, "Select at least one media type"),
		mode: importListModeEnum,
		enabled: z.boolean().default(true),
		config: z.record(z.string(), z.unknown()),
		monitorBehavior: z.enum(["all", "none", "new"]).default("all"),
		applySearchOnAdd: z.boolean().default(false),
		rootFolderDefaults: z.record(z.string(), z.string()).default({}),
		profileDefaults: z.record(z.string(), z.number()).default({}),
	})
	.superRefine((value, ctx) => {
		try {
			assertProviderMediaTypes(value.provider, value.mediaTypes);
			providerCapabilities[value.provider].configSchema.parse(value.config);
		} catch (error) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: error instanceof Error ? error.message : "Invalid import-list configuration",
				path: ["config"],
			});
		}
	});

export const createImportListSchema = importListBaseSchema;

export const updateImportListSchema = importListBaseSchema.extend({
	id: z.number(),
});

export const deleteImportListSchema = z.object({
	id: z.number(),
});

export const syncImportListSchema = z.object({
	id: z.number(),
});
```

- [ ] **Step 5: Add the new Drizzle schema and migration**

Create `src/db/schema/import-lists.ts`:

```ts
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const importLists = sqliteTable("import_lists", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	provider: text("provider").notNull(),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	mediaTypes: text("media_types").notNull(),
	configJson: text("config_json").notNull(),
	mode: text("mode").notNull(),
	monitorBehavior: text("monitor_behavior").notNull().default("all"),
	applySearchOnAdd: integer("apply_search_on_add", { mode: "boolean" }).notNull().default(false),
	rootFolderDefaults: text("root_folder_defaults").notNull().default("{}"),
	profileDefaults: text("profile_defaults").notNull().default("{}"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const importListSyncRuns = sqliteTable("import_list_sync_runs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	importListId: integer("import_list_id").notNull().references(() => importLists.id),
	startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
	finishedAt: integer("finished_at", { mode: "timestamp" }),
	status: text("status").notNull(),
	summaryJson: text("summary_json").notNull().default("{}"),
	errorMessage: text("error_message"),
});

export const importListCandidates = sqliteTable(
	"import_list_candidates",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		importListId: integer("import_list_id").notNull().references(() => importLists.id),
		providerItemId: text("provider_item_id").notNull(),
		providerItemHash: text("provider_item_hash").notNull(),
		mediaType: text("media_type").notNull(),
		title: text("title").notNull(),
		year: integer("year"),
		externalIdsJson: text("external_ids_json").notNull().default("{}"),
		rawPayloadJson: text("raw_payload_json").notNull(),
		firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
		lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
		syncRunId: integer("sync_run_id").references(() => importListSyncRuns.id),
		matchStatus: text("match_status").notNull().default("unmatched"),
		matchTargetType: text("match_target_type"),
		matchTargetId: integer("match_target_id"),
		importStatus: text("import_status").notNull().default("pending"),
		reviewReason: text("review_reason"),
	},
	(table) => ({
		byProviderItem: uniqueIndex("import_list_candidates_list_provider_item_unique").on(
			table.importListId,
			table.providerItemId,
		),
	}),
);
```

Create `drizzle/0003_import_lists.sql`:

```sql
CREATE TABLE `import_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`media_types` text NOT NULL,
	`config_json` text NOT NULL,
	`mode` text NOT NULL,
	`monitor_behavior` text DEFAULT 'all' NOT NULL,
	`apply_search_on_add` integer DEFAULT false NOT NULL,
	`root_folder_defaults` text DEFAULT '{}' NOT NULL,
	`profile_defaults` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_list_sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_list_id` integer NOT NULL REFERENCES import_lists(id),
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `import_list_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_list_id` integer NOT NULL REFERENCES import_lists(id),
	`provider_item_id` text NOT NULL,
	`provider_item_hash` text NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`external_ids_json` text DEFAULT '{}' NOT NULL,
	`raw_payload_json` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`sync_run_id` integer REFERENCES import_list_sync_runs(id),
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`match_target_type` text,
	`match_target_id` integer,
	`import_status` text DEFAULT 'pending' NOT NULL,
	`review_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_list_candidates_list_provider_item_unique`
ON `import_list_candidates` (`import_list_id`, `provider_item_id`);
```

- [ ] **Step 6: Re-export the schema and prove validation now passes**

Update `src/db/schema/index.ts`:

```ts
export * from "./import-lists";
```

Run: `bunx vitest run src/server/__tests__/import-lists/config.test.ts`

Expected: PASS with provider/media constraints enforced.

- [ ] **Step 7: Commit the domain model**

```bash
git add src/db/schema/import-lists.ts src/db/schema/index.ts src/lib/validators.ts src/server/import-lists/config.ts drizzle/0003_import_lists.sql src/server/__tests__/import-lists/config.test.ts
git commit -m "feat(import-lists): add domain schema and validation"
```

### Task 2: Add CRUD Server Functions, Query Keys, And Mutations

**Files:**
- Create: `src/server/import-lists.ts`
- Modify: `src/lib/query-keys.ts`
- Create: `src/lib/queries/import-lists.ts`
- Modify: `src/lib/queries/index.ts`
- Create: `src/hooks/mutations/import-lists.ts`
- Modify: `src/hooks/mutations/index.ts`
- Test: `src/server/__tests__/import-lists/server.test.ts`

- [ ] **Step 1: Write the failing CRUD server-function tests**

Create `src/server/__tests__/import-lists/server.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("import-list server functions", () => {
	it("creates and lists import lists", async () => {
		const inserted = { id: 3 };
		const insertRun = vi.fn(() => inserted);
		const insertValues = vi.fn(() => ({ returning: insertRun }));
		const selectAll = vi.fn(() => [
			{ id: 3, name: "IMDb Watchlist", provider: "imdb", enabled: true },
		]);

		vi.doMock("src/db", () => ({
			db: {
				insert: vi.fn(() => ({ values: insertValues })),
				select: vi.fn(() => ({ from: vi.fn(() => ({ all: selectAll })) })),
			},
		}));
		vi.doMock("./middleware", () => ({
			requireAdmin: vi.fn().mockResolvedValue({ user: { role: "admin" } }),
			requireAuth: vi.fn().mockResolvedValue({ user: { role: "admin" } }),
		}));

		const { createImportListFn, getImportListsFn } = await import("src/server/import-lists");

		await createImportListFn({
			data: {
				name: "IMDb Watchlist",
				provider: "imdb",
				mediaTypes: ["movie"],
				mode: "review-only",
				enabled: true,
				config: { listId: "ls123456789" },
				monitorBehavior: "all",
				applySearchOnAdd: false,
				rootFolderDefaults: {},
				profileDefaults: {},
			},
		});

		const rows = await getImportListsFn();
		expect(rows[0]).toMatchObject({ provider: "imdb", name: "IMDb Watchlist" });
	});
});
```

- [ ] **Step 2: Run the tests to verify the new server surface is missing**

Run: `bunx vitest run src/server/__tests__/import-lists/server.test.ts`

Expected: FAIL with missing `src/server/import-lists.ts`.

- [ ] **Step 3: Add CRUD server functions for list rows and candidate review**

Create `src/server/import-lists.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "src/db";
import {
	importListCandidates,
	importLists,
	importListSyncRuns,
} from "src/db/schema";
import {
	createImportListSchema,
	deleteImportListSchema,
	syncImportListSchema,
	updateImportListSchema,
} from "src/lib/validators";
import { requireAdmin, requireAuth } from "./middleware";
import { syncImportListById } from "./import-lists/service";

export const getImportListsFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireAuth();
	return db.select().from(importLists).orderBy(desc(importLists.updatedAt)).all();
});

export const getImportListCandidatesFn = createServerFn({ method: "GET" })
	.inputValidator((d: { importListId: number }) => d)
	.handler(async ({ data }) => {
		await requireAuth();
		return db
			.select()
			.from(importListCandidates)
			.where(eq(importListCandidates.importListId, data.importListId))
			.orderBy(desc(importListCandidates.lastSeenAt))
			.all();
	});

export const getImportListRunsFn = createServerFn({ method: "GET" })
	.inputValidator((d: { importListId: number }) => d)
	.handler(async ({ data }) => {
		await requireAuth();
		return db
			.select()
			.from(importListSyncRuns)
			.where(eq(importListSyncRuns.importListId, data.importListId))
			.orderBy(desc(importListSyncRuns.startedAt))
			.all();
	});

export const createImportListFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => createImportListSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return db.insert(importLists).values({
			name: data.name,
			provider: data.provider,
			enabled: data.enabled,
			mediaTypes: JSON.stringify(data.mediaTypes),
			configJson: JSON.stringify(data.config),
			mode: data.mode,
			monitorBehavior: data.monitorBehavior,
			applySearchOnAdd: data.applySearchOnAdd,
			rootFolderDefaults: JSON.stringify(data.rootFolderDefaults),
			profileDefaults: JSON.stringify(data.profileDefaults),
			updatedAt: new Date(),
		}).returning().get();
	});

export const updateImportListFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateImportListSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.update(importLists).set({
			name: data.name,
			provider: data.provider,
			enabled: data.enabled,
			mediaTypes: JSON.stringify(data.mediaTypes),
			configJson: JSON.stringify(data.config),
			mode: data.mode,
			monitorBehavior: data.monitorBehavior,
			applySearchOnAdd: data.applySearchOnAdd,
			rootFolderDefaults: JSON.stringify(data.rootFolderDefaults),
			profileDefaults: JSON.stringify(data.profileDefaults),
			updatedAt: new Date(),
		}).where(eq(importLists.id, data.id)).run();
		return { success: true };
	});

export const deleteImportListFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteImportListSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.delete(importLists).where(eq(importLists.id, data.id)).run();
		return { success: true };
	});

export const runImportListSyncFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => syncImportListSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return syncImportListById(data.id);
	});
```

- [ ] **Step 4: Add query keys, query factories, and mutations**

Update `src/lib/query-keys.ts`:

```ts
importLists: {
	all: ["importLists"] as const,
	lists: () => ["importLists", "list"] as const,
	candidates: (importListId: number) => ["importLists", "candidates", importListId] as const,
	runs: (importListId: number) => ["importLists", "runs", importListId] as const,
},
```

Create `src/lib/queries/import-lists.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import {
	getImportListCandidatesFn,
	getImportListsFn,
	getImportListRunsFn,
} from "src/server/import-lists";

export const importListsQuery = () =>
	queryOptions({
		queryKey: queryKeys.importLists.lists(),
		queryFn: () => getImportListsFn(),
	});

export const importListCandidatesQuery = (importListId: number) =>
	queryOptions({
		queryKey: queryKeys.importLists.candidates(importListId),
		queryFn: () => getImportListCandidatesFn({ data: { importListId } }),
	});

export const importListRunsQuery = (importListId: number) =>
	queryOptions({
		queryKey: queryKeys.importLists.runs(importListId),
		queryFn: () => getImportListRunsFn({ data: { importListId } }),
	});
```

Create `src/hooks/mutations/import-lists.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import {
	createImportListFn,
	deleteImportListFn,
	runImportListSyncFn,
	updateImportListFn,
} from "src/server/import-lists";

export function useCreateImportList() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Parameters<typeof createImportListFn>[0]["data"]) =>
			createImportListFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.importLists.all });
			toast.success("Import list created");
		},
	});
}

export function useRunImportListSync() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Parameters<typeof runImportListSyncFn>[0]["data"]) =>
			runImportListSyncFn({ data }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.importLists.all });
			queryClient.invalidateQueries({
				queryKey: queryKeys.importLists.candidates(variables.id),
			});
			toast.success("Import list sync complete");
		},
	});
}
```

- [ ] **Step 5: Re-export the query and mutation surface**

Update `src/lib/queries/index.ts`:

```ts
export * from "./import-lists";
```

Update `src/hooks/mutations/index.ts`:

```ts
export * from "./import-lists";
```

- [ ] **Step 6: Run the focused CRUD tests**

Run: `bunx vitest run src/server/__tests__/import-lists/server.test.ts`

Expected: PASS for create/list behavior.

- [ ] **Step 7: Commit the CRUD surface**

```bash
git add src/server/import-lists.ts src/lib/query-keys.ts src/lib/queries/import-lists.ts src/lib/queries/index.ts src/hooks/mutations/import-lists.ts src/hooks/mutations/index.ts src/server/__tests__/import-lists/server.test.ts
git commit -m "feat(import-lists): add CRUD server and query surface"
```

### Task 3: Implement Provider Registry And IMDb/Trakt/Plex Adapters

**Files:**
- Create: `src/server/import-lists/types.ts`
- Create: `src/server/import-lists/registry.ts`
- Create: `src/server/import-lists/providers/imdb.ts`
- Create: `src/server/import-lists/providers/trakt.ts`
- Create: `src/server/import-lists/providers/plex.ts`
- Test: `src/server/__tests__/import-lists/providers.test.ts`

- [ ] **Step 1: Write the failing provider-normalization tests**

Create `src/server/__tests__/import-lists/providers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getImportListProvider } from "src/server/import-lists/registry";

describe("import-list providers", () => {
	it("normalizes IMDb movie rows", async () => {
		const provider = getImportListProvider("imdb");
		const candidate = provider.normalizeItem({
			id: "tt0133093",
			title: "The Matrix",
			type: "movie",
			year: 1999,
			tmdbId: 603,
		});

		expect(candidate).toMatchObject({
			providerItemId: "tt0133093",
			mediaType: "movie",
			title: "The Matrix",
			externalIds: { imdb: "tt0133093", tmdb: 603 },
		});
	});

	it("normalizes Trakt show rows", async () => {
		const provider = getImportListProvider("trakt");
		const candidate = provider.normalizeItem({
			ids: { trakt: 1390, slug: "breaking-bad", tmdb: 1396, tvdb: 81189 },
			title: "Breaking Bad",
			year: 2008,
			type: "show",
		});

		expect(candidate).toMatchObject({
			mediaType: "tv",
			externalIds: { trakt: 1390, tmdb: 1396, tvdb: 81189 },
		});
	});
});
```

- [ ] **Step 2: Run the provider tests to verify the registry is missing**

Run: `bunx vitest run src/server/__tests__/import-lists/providers.test.ts`

Expected: FAIL with missing `getImportListProvider`.

- [ ] **Step 3: Add shared import-list types and provider contract**

Create `src/server/import-lists/types.ts`:

```ts
export type ImportListProviderName = "imdb" | "trakt" | "plex";
export type ImportListCandidateMediaType = "movie" | "tv" | "ebook" | "audiobook";
export type MatchStatus = "unmatched" | "already_present" | "matched" | "needs_review" | "failed";
export type ImportStatus = "pending" | "imported" | "skipped" | "failed";

export type NormalizedImportCandidate = {
	provider: ImportListProviderName;
	providerItemId: string;
	providerItemHash: string;
	mediaType: ImportListCandidateMediaType;
	title: string;
	year: number | null;
	externalIds: Record<string, string | number>;
	rawPayload: unknown;
};

export type ImportListProvider = {
	name: ImportListProviderName;
	fetchItems(config: Record<string, unknown>): Promise<unknown[]>;
	normalizeItem(raw: unknown): NormalizedImportCandidate;
};
```

- [ ] **Step 4: Implement the provider registry and the three adapters**

Create `src/server/import-lists/registry.ts`:

```ts
import type { ImportListProvider, ImportListProviderName } from "./types";
import { imdbProvider } from "./providers/imdb";
import { plexProvider } from "./providers/plex";
import { traktProvider } from "./providers/trakt";

const providers: Record<ImportListProviderName, ImportListProvider> = {
	imdb: imdbProvider,
	trakt: traktProvider,
	plex: plexProvider,
};

export function getImportListProvider(name: ImportListProviderName): ImportListProvider {
	return providers[name];
}
```

Create `src/server/import-lists/providers/imdb.ts`:

```ts
import type { ImportListProvider } from "../types";

export const imdbProvider: ImportListProvider = {
	name: "imdb",
	async fetchItems(config) {
		const response = await fetch(`https://www.imdb.com/list/${config.listId}`);
		return response.json();
	},
	normalizeItem(raw) {
		const item = raw as {
			id: string;
			title: string;
			type: "movie" | "show";
			year?: number;
			tmdbId?: number;
		};
		return {
			provider: "imdb",
			providerItemId: item.id,
			providerItemHash: `${item.id}:${item.type}:${item.year ?? "na"}`,
			mediaType: item.type === "show" ? "tv" : "movie",
			title: item.title,
			year: item.year ?? null,
			externalIds: {
				imdb: item.id,
				...(item.tmdbId ? { tmdb: item.tmdbId } : {}),
			},
			rawPayload: raw,
		};
	},
};
```

Mirror the same shape for Trakt and Plex:

```ts
// src/server/import-lists/providers/trakt.ts
export const traktProvider: ImportListProvider = {
	name: "trakt",
	async fetchItems(config) {
		const headers = { Authorization: `Bearer ${config.accessToken}` };
		const response = await fetch(
			`https://api.trakt.tv/users/${config.username}/lists/${config.listSlug}/items`,
			{ headers },
		);
		return response.json();
	},
	normalizeItem(raw) {
		const item = raw as { type: "movie" | "show"; title: string; year?: number; ids: Record<string, string | number> };
		return {
			provider: "trakt",
			providerItemId: String(item.ids.trakt ?? item.ids.slug),
			providerItemHash: JSON.stringify(item.ids),
			mediaType: item.type === "show" ? "tv" : "movie",
			title: item.title,
			year: item.year ?? null,
			externalIds: item.ids,
			rawPayload: raw,
		};
	},
};
```

```ts
// src/server/import-lists/providers/plex.ts
export const plexProvider: ImportListProvider = {
	name: "plex",
	async fetchItems(config) {
		const response = await fetch(
			`${config.serverUrl}/library/sections/${config.libraryId}/all?X-Plex-Token=${config.token}`,
		);
		return response.json();
	},
	normalizeItem(raw) {
		const item = raw as { ratingKey: string; type: "movie" | "show"; title: string; year?: number; guidMap?: Record<string, string | number> };
		return {
			provider: "plex",
			providerItemId: item.ratingKey,
			providerItemHash: `${item.ratingKey}:${item.year ?? "na"}`,
			mediaType: item.type === "show" ? "tv" : "movie",
			title: item.title,
			year: item.year ?? null,
			externalIds: item.guidMap ?? {},
			rawPayload: raw,
		};
	},
};
```

- [ ] **Step 5: Run the adapter tests**

Run: `bunx vitest run src/server/__tests__/import-lists/providers.test.ts`

Expected: PASS with movie and TV normalization covered for IMDb and Trakt; extend the same file with a Plex case before moving on.

- [ ] **Step 6: Commit the provider layer**

```bash
git add src/server/import-lists/types.ts src/server/import-lists/registry.ts src/server/import-lists/providers/imdb.ts src/server/import-lists/providers/trakt.ts src/server/import-lists/providers/plex.ts src/server/__tests__/import-lists/providers.test.ts
git commit -m "feat(import-lists): add imdb trakt plex adapters"
```

### Task 4: Build Matching, Candidate Persistence, And Auto-Import Service

**Files:**
- Create: `src/server/import-lists/matcher.ts`
- Create: `src/server/import-lists/import-actions.ts`
- Create: `src/server/import-lists/service.ts`
- Modify: `src/server/movies.ts`
- Modify: `src/server/shows.ts`
- Test: `src/server/__tests__/import-lists/service.test.ts`

- [ ] **Step 1: Write the failing matching/sync tests**

Create `src/server/__tests__/import-lists/service.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("syncImportListById", () => {
	it("marks exact-id matches as already present", async () => {
		vi.doMock("src/db", () => ({
			db: {
				select: vi.fn(() => ({
					from: vi.fn(() => ({
						where: vi.fn(() => ({ get: vi.fn(() => ({ id: 99, tmdbId: 603 })) })),
					})),
				})),
				insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
				update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })) })),
			},
		}));

		const { classifyCandidate } = await import("src/server/import-lists/matcher");
		const result = await classifyCandidate({
			mediaType: "movie",
			title: "The Matrix",
			year: 1999,
			externalIds: { tmdb: 603 },
		});

		expect(result).toMatchObject({
			matchStatus: "already_present",
			matchTargetType: "movie",
			matchTargetId: 99,
		});
	});
});
```

- [ ] **Step 2: Run the service test to verify the matcher does not exist**

Run: `bunx vitest run src/server/__tests__/import-lists/service.test.ts`

Expected: FAIL with missing `classifyCandidate`.

- [ ] **Step 3: Add conservative matching helpers**

Create `src/server/import-lists/matcher.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { movies, shows } from "src/db/schema";
import type { NormalizedImportCandidate } from "./types";

export async function classifyCandidate(
	candidate: Pick<NormalizedImportCandidate, "mediaType" | "title" | "year" | "externalIds">,
) {
	if (candidate.mediaType === "movie" && typeof candidate.externalIds.tmdb === "number") {
		const movie = db
			.select({ id: movies.id, tmdbId: movies.tmdbId })
			.from(movies)
			.where(eq(movies.tmdbId, candidate.externalIds.tmdb))
			.get();
		if (movie) {
			return {
				matchStatus: "already_present" as const,
				matchTargetType: "movie" as const,
				matchTargetId: movie.id,
				reviewReason: null,
			};
		}
	}

	if (candidate.mediaType === "tv" && typeof candidate.externalIds.tmdb === "number") {
		const show = db
			.select({ id: shows.id, tmdbId: shows.tmdbId })
			.from(shows)
			.where(eq(shows.tmdbId, candidate.externalIds.tmdb))
			.get();
		if (show) {
			return {
				matchStatus: "already_present" as const,
				matchTargetType: "show" as const,
				matchTargetId: show.id,
				reviewReason: null,
			};
		}
	}

	if (!candidate.year) {
		return {
			matchStatus: "needs_review" as const,
			matchTargetType: null,
			matchTargetId: null,
			reviewReason: "Missing release year for confident matching",
		};
	}

	return {
		matchStatus: "matched" as const,
		matchTargetType: null,
		matchTargetId: null,
		reviewReason: null,
	};
}
```

- [ ] **Step 4: Add import wrappers that reuse existing add flows**

Create `src/server/import-lists/import-actions.ts`:

```ts
import { addMovieFn } from "src/server/movies";
import { addShowFn } from "src/server/shows";

export async function importMovieCandidate(input: {
	tmdbId: number;
	rootFolderPath: string;
	profileId: number;
	searchOnAdd: boolean;
}) {
	return addMovieFn({
		data: {
			tmdbId: input.tmdbId,
			rootFolderPath: input.rootFolderPath,
			downloadProfileIds: [input.profileId],
			searchOnAdd: input.searchOnAdd,
		},
	});
}

export async function importShowCandidate(input: {
	tmdbId: number;
	profileId: number;
	searchOnAdd: boolean;
}) {
	return addShowFn({
		data: {
			tmdbId: input.tmdbId,
			downloadProfileIds: [input.profileId],
			searchOnAdd: input.searchOnAdd,
		},
	});
}
```

- [ ] **Step 5: Build the shared sync service**

Create `src/server/import-lists/service.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "src/db";
import {
	importListCandidates,
	importLists,
	importListSyncRuns,
} from "src/db/schema";
import { getImportListProvider } from "./registry";
import { classifyCandidate } from "./matcher";
import { importMovieCandidate, importShowCandidate } from "./import-actions";

export async function syncImportListById(importListId: number) {
	const list = db.select().from(importLists).where(eq(importLists.id, importListId)).get();
	if (!list) {
		throw new Error(`Unknown import list: ${importListId}`);
	}

	const provider = getImportListProvider(list.provider as "imdb" | "trakt" | "plex");
	const config = JSON.parse(list.configJson) as Record<string, unknown>;
	const run = db.insert(importListSyncRuns).values({
		importListId,
		startedAt: new Date(),
		status: "running",
	}).returning().get();

	const remoteItems = await provider.fetchItems(config);
	let imported = 0;
	let review = 0;

	for (const raw of remoteItems) {
		const normalized = provider.normalizeItem(raw);
		const match = await classifyCandidate(normalized);

		db.insert(importListCandidates).values({
			importListId,
			providerItemId: normalized.providerItemId,
			providerItemHash: normalized.providerItemHash,
			mediaType: normalized.mediaType,
			title: normalized.title,
			year: normalized.year,
			externalIdsJson: JSON.stringify(normalized.externalIds),
			rawPayloadJson: JSON.stringify(normalized.rawPayload),
			firstSeenAt: new Date(),
			lastSeenAt: new Date(),
			syncRunId: run.id,
			matchStatus: match.matchStatus,
			matchTargetType: match.matchTargetType,
			matchTargetId: match.matchTargetId,
			importStatus: "pending",
			reviewReason: match.reviewReason,
		}).onConflictDoUpdate({
			target: [importListCandidates.importListId, importListCandidates.providerItemId],
			set: {
				lastSeenAt: new Date(),
				syncRunId: run.id,
				matchStatus: match.matchStatus,
				matchTargetType: match.matchTargetType,
				matchTargetId: match.matchTargetId,
				reviewReason: match.reviewReason,
			},
		}).run();

		if (list.mode === "auto-import" && match.matchStatus === "matched") {
			if (normalized.mediaType === "movie" && typeof normalized.externalIds.tmdb === "number") {
				await importMovieCandidate({
					tmdbId: normalized.externalIds.tmdb,
					rootFolderPath: JSON.parse(list.rootFolderDefaults).movie,
					profileId: JSON.parse(list.profileDefaults).movie,
					searchOnAdd: Boolean(list.applySearchOnAdd),
				});
				imported += 1;
			} else if (normalized.mediaType === "tv" && typeof normalized.externalIds.tmdb === "number") {
				await importShowCandidate({
					tmdbId: normalized.externalIds.tmdb,
					profileId: JSON.parse(list.profileDefaults).tv,
					searchOnAdd: Boolean(list.applySearchOnAdd),
				});
				imported += 1;
			}
		} else if (match.matchStatus === "needs_review") {
			review += 1;
		}
	}

	db.update(importListSyncRuns).set({
		finishedAt: new Date(),
		status: "success",
		summaryJson: JSON.stringify({ fetched: remoteItems.length, imported, review }),
	}).where(eq(importListSyncRuns.id, run.id)).run();

	return { success: true, fetched: remoteItems.length, imported, review };
}
```

- [ ] **Step 6: Run the matcher and sync tests**

Run: `bunx vitest run src/server/__tests__/import-lists/service.test.ts`

Expected: PASS for exact-id matching; extend the same file with `needs_review` and `auto-import` assertions before moving on.

- [ ] **Step 7: Commit the sync service**

```bash
git add src/server/import-lists/matcher.ts src/server/import-lists/import-actions.ts src/server/import-lists/service.ts src/server/movies.ts src/server/shows.ts src/server/__tests__/import-lists/service.test.ts
git commit -m "feat(import-lists): add matching and sync service"
```

### Task 5: Register Scheduled Sync And Keep Manual And Automatic Paths Unified

**Files:**
- Create: `src/server/scheduler/tasks/sync-import-lists.ts`
- Modify: `src/server/scheduler/index.ts`
- Test: `src/server/__tests__/import-lists/scheduler.test.ts`

- [ ] **Step 1: Write the failing scheduler task test**

Create `src/server/__tests__/import-lists/scheduler.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("sync-import-lists task", () => {
	it("syncs enabled import lists through the shared service", async () => {
		const all = vi.fn(() => [
			{ id: 1, enabled: true },
			{ id: 2, enabled: false },
		]);
		const syncImportListById = vi.fn().mockResolvedValue({ success: true });
		const registerTask = vi.fn();

		vi.doMock("src/db", () => ({
			db: {
				select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ all })) })) })),
			},
		}));
		vi.doMock("src/db/schema", () => ({
			importLists: { enabled: { name: "enabled" } },
		}));
		vi.doMock("../scheduler/registry", () => ({ registerTask }));
		vi.doMock("src/server/import-lists/service", () => ({ syncImportListById }));

		await import("src/server/scheduler/tasks/sync-import-lists");

		expect(registerTask).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run the scheduler test to verify the task is missing**

Run: `bunx vitest run src/server/__tests__/import-lists/scheduler.test.ts`

Expected: FAIL with missing `sync-import-lists.ts`.

- [ ] **Step 3: Implement the scheduled task**

Create `src/server/scheduler/tasks/sync-import-lists.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { importLists } from "src/db/schema";
import { syncImportListById } from "src/server/import-lists/service";
import { registerTask } from "../registry";

registerTask({
	id: "sync-import-lists",
	name: "Sync Import Lists",
	description: "Sync all enabled import lists and update candidate state.",
	defaultInterval: 6 * 60 * 60,
	group: "search",
	handler: async (updateProgress) => {
		const lists = db
			.select({ id: importLists.id, name: importLists.name })
			.from(importLists)
			.where(eq(importLists.enabled, true))
			.all();

		for (const list of lists) {
			updateProgress(`Syncing ${list.name}`);
			await syncImportListById(list.id);
		}

		return {
			success: true,
			message: lists.length === 0 ? "No enabled import lists" : `Synced ${lists.length} import lists`,
		};
	},
});
```

- [ ] **Step 4: Register the new task during scheduler startup**

Update `src/server/scheduler/index.ts`:

```ts
import "./tasks/sync-import-lists";
```

- [ ] **Step 5: Run the scheduler test**

Run: `bunx vitest run src/server/__tests__/import-lists/scheduler.test.ts`

Expected: PASS with the task registered and calling the shared sync path.

- [ ] **Step 6: Commit the scheduler wiring**

```bash
git add src/server/scheduler/tasks/sync-import-lists.ts src/server/scheduler/index.ts src/server/__tests__/import-lists/scheduler.test.ts
git commit -m "feat(import-lists): schedule import list sync"
```

### Task 6: Rebuild The Settings UI And Preserve Exclusions

**Files:**
- Modify: `src/routes/_authed/settings/import-lists.tsx`
- Create: `src/components/settings/import-lists/import-list-list.tsx`
- Create: `src/components/settings/import-lists/import-list-form.tsx`
- Create: `src/components/settings/import-lists/import-list-review-table.tsx`
- Create: `src/components/settings/import-lists/import-list-exclusions-tab.tsx`
- Test: `e2e/tests/03-import-lists.spec.ts`

- [ ] **Step 1: Write the failing end-to-end settings test**

Create `e2e/tests/03-import-lists.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";

test("import lists page supports list management and exclusions", async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto("/settings/import-lists");

	await expect(page.getByRole("heading", { name: "Import Lists" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Lists" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Exclusions" })).toBeVisible();

	await page.getByRole("button", { name: "Add Import List" }).click();
	await page.getByLabel("Name").fill("IMDb Watchlist");
	await page.getByRole("combobox", { name: "Provider" }).click();
	await page.getByRole("option", { name: "IMDb" }).click();

	await expect(page.getByRole("checkbox", { name: "Books" })).toHaveCount(0);
	await expect(page.getByRole("checkbox", { name: "Movies" })).toBeVisible();
});
```

- [ ] **Step 2: Run the browser test to prove the current page is too small**

Run: `bunx playwright test e2e/tests/03-import-lists.spec.ts --config e2e/playwright.config.ts`

Expected: FAIL because the current page only shows exclusions and has no list-management UI.

- [ ] **Step 3: Extract the current exclusions content into its own tab component**

Create `src/components/settings/import-lists/import-list-exclusions-tab.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import EmptyState from "src/components/shared/empty-state";
import { Button } from "src/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { queryKeys } from "src/lib/query-keys";
import {
	getBookImportExclusionsFn,
	getMovieImportExclusionsFn,
	removeBookImportExclusionFn,
	removeMovieImportExclusionFn,
} from "src/server/import-list-exclusions";

export default function ImportListExclusionsTab() {
	// Move the current route component logic here unchanged.
	return <div>{/* existing exclusions tables and dialogs */}</div>;
}
```

- [ ] **Step 4: Build the list-management and review components**

Create `src/components/settings/import-lists/import-list-list.tsx`:

```tsx
import { Button } from "src/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/ui/table";

export default function ImportListList({
	rows,
	onSync,
	onEdit,
}: {
	rows: Array<{ id: number; name: string; provider: string; mode: string; enabled: boolean }>;
	onSync: (id: number) => void;
	onEdit: (id: number) => void;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Provider</TableHead>
					<TableHead>Mode</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="w-[180px]" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.id}>
						<TableCell>{row.name}</TableCell>
						<TableCell className="capitalize">{row.provider}</TableCell>
						<TableCell>{row.mode}</TableCell>
						<TableCell>{row.enabled ? "Enabled" : "Disabled"}</TableCell>
						<TableCell className="flex gap-2">
							<Button size="sm" variant="outline" onClick={() => onSync(row.id)}>Sync now</Button>
							<Button size="sm" variant="outline" onClick={() => onEdit(row.id)}>Edit</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

Create `src/components/settings/import-lists/import-list-form.tsx`:

```tsx
import { useMemo } from "react";
import Label from "src/components/ui/label";
import Input from "src/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { providerCapabilities } from "src/server/import-lists/config";

export default function ImportListForm({ provider }: { provider: "imdb" | "trakt" | "plex" | null }) {
	const supportedMediaTypes = useMemo(
		() => (provider ? providerCapabilities[provider].mediaTypes : []),
		[provider],
	);

	return (
		<div className="space-y-4">
			<div>
				<Label htmlFor="import-list-name">Name</Label>
				<Input id="import-list-name" />
			</div>
			<div>
				<Label>Provider</Label>
				<Select>
					<SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
					<SelectContent>
						<SelectItem value="imdb">IMDb</SelectItem>
						<SelectItem value="trakt">Trakt</SelectItem>
						<SelectItem value="plex">Plex</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-2">
				<Label>Media Types</Label>
				{supportedMediaTypes.map((mediaType) => (
					<label key={mediaType} className="flex items-center gap-2">
						<input type="checkbox" value={mediaType} />
						<span className="capitalize">{mediaType === "tv" ? "TV" : `${mediaType}s`}</span>
					</label>
				))}
			</div>
		</div>
	);
}
```

Create `src/components/settings/import-lists/import-list-review-table.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/ui/table";

export default function ImportListReviewTable({
	rows,
}: {
	rows: Array<{ id: number; title: string; mediaType: string; matchStatus: string; importStatus: string; reviewReason: string | null }>;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Title</TableHead>
					<TableHead>Media Type</TableHead>
					<TableHead>Match</TableHead>
					<TableHead>Import</TableHead>
					<TableHead>Reason</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.id}>
						<TableCell>{row.title}</TableCell>
						<TableCell className="capitalize">{row.mediaType}</TableCell>
						<TableCell>{row.matchStatus}</TableCell>
						<TableCell>{row.importStatus}</TableCell>
						<TableCell>{row.reviewReason ?? "—"}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

- [ ] **Step 5: Rewrite the route to load the new queries and render tabs**

Update `src/routes/_authed/settings/import-lists.tsx`:

```tsx
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ImportListExclusionsTab from "src/components/settings/import-lists/import-list-exclusions-tab";
import ImportListForm from "src/components/settings/import-lists/import-list-form";
import ImportListList from "src/components/settings/import-lists/import-list-list";
import ImportListReviewTable from "src/components/settings/import-lists/import-list-review-table";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { useRunImportListSync } from "src/hooks/mutations";
import { requireAdminBeforeLoad } from "src/lib/admin-route";
import { importListCandidatesQuery, importListsQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/settings/import-lists")({
	beforeLoad: requireAdminBeforeLoad,
	loader: ({ context }) => context.queryClient.ensureQueryData(importListsQuery()),
	component: ImportListsPage,
});

function ImportListsPage() {
	const { data: rows } = useSuspenseQuery(importListsQuery());
	const runSync = useRunImportListSync();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedListId, setSelectedListId] = useState<number | null>(
		rows[0]?.id ?? null,
	);
	const { data: candidates = [] } = useQuery(
		selectedListId
			? importListCandidatesQuery(selectedListId)
			: {
					queryKey: ["importLists", "candidates", "none"],
					queryFn: async () => [],
				},
	);

	return (
		<div>
			<PageHeader
				title="Import Lists"
				description="Sync remote watchlists into Allstarr."
				actions={<Button onClick={() => setDialogOpen(true)}>Add Import List</Button>}
			/>

			<Tabs defaultValue="lists">
				<TabsList className="mb-4">
					<TabsTrigger value="lists">Lists</TabsTrigger>
					<TabsTrigger value="exclusions">Exclusions</TabsTrigger>
				</TabsList>

				<TabsContent value="lists" className="space-y-6">
					<ImportListList
						rows={rows}
						onSync={(id) => runSync.mutate({ id })}
						onEdit={(id) => {
							setSelectedListId(id);
							setDialogOpen(true);
						}}
					/>
					<ImportListReviewTable rows={candidates} />
				</TabsContent>

				<TabsContent value="exclusions">
					<ImportListExclusionsTab />
				</TabsContent>
			</Tabs>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Import List</DialogTitle>
					</DialogHeader>
					<ImportListForm provider={null} />
				</DialogContent>
			</Dialog>
		</div>
	);
}
```

- [ ] **Step 6: Run the browser test and the focused quality gates**

Run: `bunx playwright test e2e/tests/03-import-lists.spec.ts --config e2e/playwright.config.ts`

Expected: PASS for tabs, add dialog, and provider-scoped media options.

Run: `bun run typecheck`

Expected: PASS.

Run: `bun run lint`

Expected: PASS.

- [ ] **Step 7: Commit the UI**

```bash
git add src/routes/_authed/settings/import-lists.tsx src/components/settings/import-lists/import-list-list.tsx src/components/settings/import-lists/import-list-form.tsx src/components/settings/import-lists/import-list-review-table.tsx src/components/settings/import-lists/import-list-exclusions-tab.tsx e2e/tests/03-import-lists.spec.ts
git commit -m "feat(import-lists): add settings management UI"
```

### Task 7: Run The Full Verification Sweep And Update Supporting Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-08-import-lists-design.md` (only if implementation scope drifted)

- [ ] **Step 1: Document the new operator-visible feature briefly**

Update `README.md` with one concise bullet under local development or feature notes:

```md
- Import Lists: provider-backed IMDb, Trakt, and Plex list sync for movies and TV, with review-only and auto-import modes.
```

- [ ] **Step 2: Run the focused test suite for the new feature**

Run: `bunx vitest run src/server/__tests__/import-lists/config.test.ts src/server/__tests__/import-lists/server.test.ts src/server/__tests__/import-lists/providers.test.ts src/server/__tests__/import-lists/service.test.ts src/server/__tests__/import-lists/scheduler.test.ts`

Expected: PASS.

- [ ] **Step 3: Run the browser coverage for the route**

Run: `bunx playwright test e2e/tests/03-import-lists.spec.ts --config e2e/playwright.config.ts`

Expected: PASS.

- [ ] **Step 4: Run the repo-wide safety checks**

Run: `bun run test`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

Run: `bun run lint`

Expected: PASS.

- [ ] **Step 5: Commit the verified milestone**

```bash
git add README.md
git commit -m "docs(import-lists): document phase 1 support"
```

## Self-Review

### Spec Coverage

- Shared import-list platform: Task 1, Task 2, Task 4
- IMDb/Trakt/Plex adapters: Task 3
- Movie/TV phase-1 imports: Task 4
- Review-only and auto-import modes: Task 1, Task 4, Task 6
- Sync observability and scheduled task: Task 2, Task 5, Task 6
- Preserve exclusions workflow: Task 6
- Testing expectations: Tasks 1 through 7

### Placeholder Scan

- No `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- Every task names concrete files, commands, and expected results.

### Type Consistency

- Providers are consistently `imdb | trakt | plex`.
- Media types are consistently `movie | tv | ebook | audiobook`, with phase-1 provider capabilities constrained to `movie | tv`.
- Sync service function is consistently named `syncImportListById`.
