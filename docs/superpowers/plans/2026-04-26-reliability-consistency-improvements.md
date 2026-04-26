# Reliability And Consistency Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining audit improvements for synced indexer validation, unmapped-file rollback ownership, auto-search decomposition, search fixture quality, and fixed-wait removal.

**Architecture:** Keep the work in five reviewable checkpoints. API routes validate untrusted payloads before conversion, unmapped-file mapping gains one execution/rollback boundary, auto-search gets focused helper modules, tests move toward named domain fixtures, and e2e waits use observable readiness checks.

**Tech Stack:** TypeScript, TanStack Start server routes, Zod 4, Drizzle ORM, Bun, Vitest, Vitest Browser, Playwright e2e, Biome.

---

## File Structure

- Create: `src/server/synced-indexers/resource-schema.ts`
  - Owns Zod validation for Readarr-compatible synced indexer resources and reusable validation-error response shaping.
- Modify: `src/server/synced-indexers/mapper.ts`
  - Imports and re-exports the parsed resource type from the schema module.
- Modify: `src/routes/api/v1/indexer/index.ts`
  - Parses `POST /api/v1/indexer` JSON before logging, mapping, or persistence.
- Modify: `src/routes/api/v1/indexer/$id.ts`
  - Parses `PUT /api/v1/indexer/$id` JSON before logging, mapping, or persistence.
- Modify: `src/routes/api/v1/indexer/routes.test.ts`
  - Covers malformed JSON, invalid payloads, mapper rejection, and persistence isolation.
- Create: `src/server/unmapped-file-mapping-executor.ts`
  - Owns move execution records, DB transaction execution, reverse rollback, and rollback warning logging.
- Create: `src/server/unmapped-file-mapping-executor.test.ts`
  - Tests success, transaction failure rollback, and rollback warning behavior.
- Modify: `src/server/unmapped-files.ts`
  - Replaces repeated `try` / move / `db.transaction` / rollback blocks with the executor while preserving content-specific planning.
- Modify: `src/server/unmapped-files.test.ts`
  - Keeps representative TV and non-TV mapping rollback tests behavior-focused.
- Create: `src/server/auto-search-indexer-search.ts`
  - Owns enabled-indexer search execution with rate-limit gates, per-indexer error isolation, and release enrichment.
- Create: `src/server/auto-search-download-dispatch.ts`
  - Owns download-client resolution, provider config creation, provider dispatch, tracked-download row shaping, and history row shaping.
- Create: `src/server/auto-search-test-fixtures.ts`
  - Provides named builders for releases, download clients, indexers, and tracked/history assertions used by auto-search tests.
- Modify: `src/server/auto-search.ts`
  - Delegates search and dispatch behavior to helper modules while keeping scheduler ordering stable.
- Modify: `src/server/auto-search.test.ts`
  - Replaces brittle query-order setup around touched search/dispatch behavior with named builders.
- Modify: `src/server/__tests__/indexers.test.ts`
  - Simplifies touched synced-indexer and search/grab fixtures without changing assertions about behavior.
- Create: `e2e/helpers/tasks.ts`
  - Provides one shared scheduled-task trigger helper that waits on task status instead of sleeping after click.
- Modify: `e2e/helpers/auth.ts`
  - Removes raw hydration/session sleeps and waits on observable page/session state.
- Modify: `e2e/helpers/sse.ts`
  - Adds event predicate support and removes timeout-only capture.
- Modify: `e2e/tests/06-auto-search.spec.ts`
- Modify: `e2e/tests/07-download-lifecycle.spec.ts`
- Modify: `e2e/tests/08-disk-scan.spec.ts`
- Modify: `e2e/tests/10-blocklist-failure.spec.ts`
  - Uses the shared task helper and removes post-task `page.waitForTimeout`.

---

### Task 1: Validate Synced Indexer API Payloads

**Files:**
- Create: `src/server/synced-indexers/resource-schema.ts`
- Modify: `src/server/synced-indexers/mapper.ts`
- Modify: `src/routes/api/v1/indexer/index.ts`
- Modify: `src/routes/api/v1/indexer/$id.ts`
- Test: `src/routes/api/v1/indexer/routes.test.ts`
- Test: `src/routes/api/v1/indexer/schema.test.ts`
- Test: `src/server/synced-indexers/resource-schema.test.ts`

- [ ] **Step 1: Write failing route tests for invalid create payloads**

Add these tests to `src/routes/api/v1/indexer/routes.test.ts` inside `describe("synced indexer api routes", ...)`.

```ts
	it("rejects malformed JSON when creating a synced indexer", async () => {
		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer", {
				body: "{",
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			message: "Invalid indexer payload",
		});
		expect(syncApiMocks.fromReadarrResource).not.toHaveBeenCalled();
		expect(syncApiMocks.db.insert).not.toHaveBeenCalled();
	});

	it("rejects invalid synced indexer create payloads before persistence", async () => {
		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer", {
				body: JSON.stringify({
					implementation: "Bogus",
					name: "",
					protocol: "invalid",
					fields: "not-fields",
				}),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			message: "Invalid indexer payload",
		});
		expect(syncApiMocks.fromReadarrResource).not.toHaveBeenCalled();
		expect(syncApiMocks.db.insert).not.toHaveBeenCalled();
	});
```

- [ ] **Step 2: Write failing route tests for invalid update payloads and mapper rejection**

Add these tests to `src/routes/api/v1/indexer/routes.test.ts`.

```ts
	it("rejects invalid synced indexer update payloads before persistence", async () => {
		syncApiMocks.get.mockResolvedValue({
			id: 4,
			implementation: "Newznab",
			name: "Existing",
			protocol: "usenet",
		});

		const handler = (
			IndexerIdRoute as unknown as {
				server: {
					handlers: {
						PUT: (input: {
							params: { id: string };
							request: Request;
						}) => Promise<Response>;
					};
				};
			}
		).server.handlers.PUT;

		const response = await handler({
			params: { id: "4" },
			request: new Request("https://example.com/api/v1/indexer/4", {
				body: JSON.stringify({
					configContract: "NewznabSettings",
					enableAutomaticSearch: true,
					enableInteractiveSearch: true,
					enableRss: true,
					fields: [],
					implementation: "Newznab",
					name: 123,
					priority: 25,
					protocol: "usenet",
				}),
				headers: { "content-type": "application/json" },
				method: "PUT",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			message: "Invalid indexer payload",
		});
		expect(syncApiMocks.fromReadarrResource).not.toHaveBeenCalled();
		expect(syncApiMocks.db.update).not.toHaveBeenCalled();
	});

	it("returns 400 when validated payload cannot be mapped", async () => {
		syncApiMocks.fromReadarrResource.mockImplementation(() => {
			throw new Error("baseUrl is required");
		});

		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer", {
				body: JSON.stringify({
					configContract: "NewznabSettings",
					enableAutomaticSearch: true,
					enableInteractiveSearch: true,
					enableRss: true,
					fields: [],
					implementation: "Newznab",
					name: "Broken Indexer",
					priority: 25,
					protocol: "usenet",
				}),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			message: "Invalid indexer payload",
			errors: ["baseUrl is required"],
		});
		expect(syncApiMocks.db.insert).not.toHaveBeenCalled();
	});
```

- [ ] **Step 3: Run the failing route tests**

Run:

```bash
bun run test -- src/routes/api/v1/indexer/routes.test.ts
```

Expected: FAIL. The invalid JSON test will throw before returning a response, invalid structured payloads will reach `fromReadarrResource`, and mapper rejection will not be normalized to status 400.

- [ ] **Step 4: Add the synced indexer resource schema**

Create `src/server/synced-indexers/resource-schema.ts`.

```ts
import * as z from "zod";

const readarrFieldSchema = z.object({
	name: z.string().min(1),
	value: z.unknown(),
});

export const readarrIndexerResourceSchema = z
	.object({
		id: z.number().int().positive().optional(),
		name: z.string().trim().min(1),
		implementation: z.enum(["Newznab", "Torznab"]),
		implementationName: z.string().optional(),
		configContract: z.string().trim().min(1),
		infoLink: z.string().optional(),
		fields: z.array(readarrFieldSchema),
		enableRss: z.boolean(),
		enableAutomaticSearch: z.boolean(),
		enableInteractiveSearch: z.boolean(),
		supportsRss: z.boolean().optional(),
		supportsSearch: z.boolean().optional(),
		protocol: z.enum(["usenet", "torrent"]),
		priority: z.number().int(),
		tags: z.array(z.number().int()).optional(),
	})
	.superRefine((resource, ctx) => {
		const fieldNames = new Set(resource.fields.map((field) => field.name));
		if (!fieldNames.has("baseUrl")) {
			ctx.addIssue({
				code: "custom",
				message: "baseUrl is required",
				path: ["fields"],
			});
		}
		if (resource.implementation === "Torznab" && resource.protocol !== "torrent") {
			ctx.addIssue({
				code: "custom",
				message: "Torznab indexers must use torrent protocol",
				path: ["protocol"],
			});
		}
		if (resource.implementation === "Newznab" && resource.protocol !== "usenet") {
			ctx.addIssue({
				code: "custom",
				message: "Newznab indexers must use usenet protocol",
				path: ["protocol"],
			});
		}
	});

export type ReadarrField = z.infer<typeof readarrFieldSchema>;
export type ReadarrIndexerResource = z.infer<typeof readarrIndexerResourceSchema>;

export type ValidationErrorBody = {
	message: "Invalid indexer payload";
	errors: string[];
};

export function invalidIndexerPayloadResponse(
	errors: string[],
): Response {
	return Response.json(
		{
			message: "Invalid indexer payload",
			errors,
		} satisfies ValidationErrorBody,
		{ status: 400 },
	);
}

export function formatIndexerPayloadError(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
		return `${path}${issue.message}`;
	});
}

export async function parseReadarrIndexerResourceRequest(
	request: Request,
): Promise<
	| { success: true; data: ReadarrIndexerResource }
	| { success: false; response: Response }
> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return {
			success: false,
			response: invalidIndexerPayloadResponse(["Request body must be valid JSON"]),
		};
	}

	const parsed = readarrIndexerResourceSchema.safeParse(body);
	if (!parsed.success) {
		return {
			success: false,
			response: invalidIndexerPayloadResponse(
				formatIndexerPayloadError(parsed.error),
			),
		};
	}

	return { success: true, data: parsed.data };
}
```

- [ ] **Step 5: Align mapper types with the schema**

Modify `src/server/synced-indexers/mapper.ts` so it imports the resource types instead of defining them locally.

```ts
import type { NewSyncedIndexer, SyncedIndexer } from "src/db/schema";
import { CATEGORY_MAP } from "src/lib/categories";
import type {
	ReadarrField,
	ReadarrIndexerResource,
} from "src/server/synced-indexers/resource-schema";

export type { ReadarrField, ReadarrIndexerResource };
```

Remove the existing local `export type ReadarrField = ...` and `export type ReadarrIndexerResource = ...` definitions.

- [ ] **Step 6: Parse create requests before logging and mapping**

Modify `src/routes/api/v1/indexer/index.ts`.

```ts
import { createFileRoute } from "@tanstack/react-router";
import { db } from "src/db";
import { syncedIndexers } from "src/db/schema";
import requireApiKey from "src/server/api-key-auth";
import { summarizeIndexerResource } from "src/server/synced-indexers/logging";
import {
	fromReadarrResource,
	toReadarrResource,
} from "src/server/synced-indexers/mapper";
import {
	invalidIndexerPayloadResponse,
	parseReadarrIndexerResourceRequest,
} from "src/server/synced-indexers/resource-schema";
```

Replace the current `POST` body parsing block with:

```ts
				const parsed = await parseReadarrIndexerResourceRequest(request);
				if (!parsed.success) {
					return parsed.response;
				}

				const body = parsed.data;
				console.info(
					`[Sync API] POST /indexer -> creating "${body.name}" (${body.implementation}, protocol=${body.protocol})`,
					summarizeIndexerResource(body),
				);

				let data: ReturnType<typeof fromReadarrResource>;
				try {
					data = fromReadarrResource(body);
				} catch (error) {
					return invalidIndexerPayloadResponse([
						error instanceof Error ? error.message : String(error),
					]);
				}
```

Leave the existing insert and response code directly after the new `data` assignment.

- [ ] **Step 7: Parse update requests before logging and mapping**

Modify `src/routes/api/v1/indexer/$id.ts` with the same imports and replace the current `PUT` body parsing block with:

```ts
				const parsed = await parseReadarrIndexerResourceRequest(request);
				if (!parsed.success) {
					return parsed.response;
				}

				const body = parsed.data;
				console.info(
					`[Sync API] PUT /indexer/${id} -> updating "${body.name}" (${body.implementation}, protocol=${body.protocol})`,
					summarizeIndexerResource(body),
				);

				let data: ReturnType<typeof fromReadarrResource>;
				try {
					data = fromReadarrResource(body);
				} catch (error) {
					return invalidIndexerPayloadResponse([
						error instanceof Error ? error.message : String(error),
					]);
				}
```

Leave the existing update and response code directly after the new `data` assignment.

- [ ] **Step 8: Add schema-level tests**

Create `src/server/synced-indexers/resource-schema.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import { readarrIndexerResourceSchema } from "src/server/synced-indexers/resource-schema";

describe("readarrIndexerResourceSchema", () => {
	it("accepts a Newznab payload with required baseUrl field", () => {
		const result = readarrIndexerResourceSchema.safeParse({
			configContract: "NewznabSettings",
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			fields: [{ name: "baseUrl", value: "https://indexer.example" }],
			implementation: "Newznab",
			name: "Books Indexer",
			priority: 25,
			protocol: "usenet",
		});

		expect(result.success).toBe(true);
	});

	it("rejects implementation and protocol mismatches", () => {
		const result = readarrIndexerResourceSchema.safeParse({
			configContract: "TorznabSettings",
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			fields: [{ name: "baseUrl", value: "https://indexer.example" }],
			implementation: "Torznab",
			name: "Torrent Indexer",
			priority: 25,
			protocol: "usenet",
		});

		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 9: Run Task 1 verification**

Run:

```bash
bun run test -- src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/synced-indexers/resource-schema.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

Run:

```bash
git add src/server/synced-indexers/resource-schema.ts src/server/synced-indexers/mapper.ts src/routes/api/v1/indexer/index.ts 'src/routes/api/v1/indexer/$id.ts' src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/synced-indexers/resource-schema.test.ts
git commit -m "fix(indexers): validate synced indexer payloads"
```

Expected: commit succeeds.

---

### Task 2: Extract Unmapped-File Mapping Executor

**Files:**
- Create: `src/server/unmapped-file-mapping-executor.ts`
- Create: `src/server/unmapped-file-mapping-executor.test.ts`
- Modify: `src/server/unmapped-files.ts`
- Test: `src/server/unmapped-files.test.ts`

- [ ] **Step 1: Write executor tests first**

Create `src/server/unmapped-file-mapping-executor.test.ts`.

```ts
import { describe, expect, it, vi } from "vitest";
import {
	type MappingMoveOperation,
	executeMappingWithRollback,
} from "src/server/unmapped-file-mapping-executor";

function createFsMock() {
	return {
		renameSync: vi.fn(),
		mkdirSync: vi.fn(),
		existsSync: vi.fn(() => true),
		rmSync: vi.fn(),
	};
}

describe("executeMappingWithRollback", () => {
	it("runs moves before the transaction and returns the transaction result", () => {
		const fs = createFsMock();
		const moved: MappingMoveOperation[] = [];

		const result = executeMappingWithRollback({
			fs,
			logLabel: "test move",
			move: ({ recordMove }) => {
				recordMove({ from: "/source/book.epub", to: "/dest/book.epub", kind: "file" });
				fs.renameSync("/source/book.epub", "/dest/book.epub");
			},
			runTransaction: () => "mapped",
		});

		moved.push({ from: "/source/book.epub", to: "/dest/book.epub", kind: "file" });
		expect(result).toBe("mapped");
		expect(fs.renameSync).toHaveBeenCalledWith("/source/book.epub", "/dest/book.epub");
		expect(fs.renameSync).toHaveBeenCalledTimes(1);
		expect(moved).toHaveLength(1);
	});

	it("rolls back recorded moves in reverse order when the transaction fails", () => {
		const fs = createFsMock();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				move: ({ recordMove }) => {
					recordMove({ from: "/source/book.epub", to: "/dest/book.epub", kind: "file" });
					recordMove({ from: "/source/book.srt", to: "/dest/book.srt", kind: "file" });
				},
				runTransaction: () => {
					throw new Error("insert failed");
				},
			}),
		).toThrow("insert failed");

		expect(fs.renameSync).toHaveBeenNthCalledWith(1, "/dest/book.srt", "/source/book.srt");
		expect(fs.renameSync).toHaveBeenNthCalledWith(2, "/dest/book.epub", "/source/book.epub");
	});

	it("logs rollback failures without masking the original error", () => {
		const fs = createFsMock();
		fs.renameSync.mockImplementation(() => {
			throw new Error("rollback failed");
		});
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				logWarn,
				move: ({ recordMove }) => {
					recordMove({ from: "/source/book.epub", to: "/dest/book.epub", kind: "file" });
				},
				runTransaction: () => {
					throw new Error("insert failed");
				},
			}),
		).toThrow("insert failed");

		expect(logWarn).toHaveBeenCalledWith(
			"unmapped-files",
			expect.stringContaining("Failed to roll back test move"),
		);
	});
});
```

- [ ] **Step 2: Run the failing executor tests**

Run:

```bash
bun run test -- src/server/unmapped-file-mapping-executor.test.ts
```

Expected: FAIL because `src/server/unmapped-file-mapping-executor.ts` does not exist.

- [ ] **Step 3: Implement the executor**

Create `src/server/unmapped-file-mapping-executor.ts`.

```ts
import path from "node:path";
import { logWarn as defaultLogWarn } from "src/server/logger";

export type MappingMoveKind = "file" | "directory";

export type MappingMoveOperation = {
	from: string;
	to: string;
	kind: MappingMoveKind;
};

type MappingFs = {
	existsSync: (target: string) => boolean;
	mkdirSync: (target: string, options?: { recursive?: boolean }) => unknown;
	renameSync: (from: string, to: string) => unknown;
};

type ExecuteMappingInput<TResult> = {
	fs: MappingFs;
	logLabel: string;
	logWarn?: (scope: string, message: string) => void;
	move: (helpers: {
		recordMove: (operation: MappingMoveOperation) => void;
	}) => void;
	runTransaction: () => TResult;
};

function movePathToManagedDestination(
	fs: MappingFs,
	from: string,
	to: string,
	kind: MappingMoveKind,
): void {
	if (!fs.existsSync(from)) {
		return;
	}
	const parent = path.dirname(to);
	if (!fs.existsSync(parent)) {
		fs.mkdirSync(parent, { recursive: true });
	}
	fs.renameSync(from, to);
}

function rollbackMovedPaths({
	fs,
	logLabel,
	logWarn,
	movedPaths,
}: {
	fs: MappingFs;
	logLabel: string;
	logWarn: (scope: string, message: string) => void;
	movedPaths: MappingMoveOperation[];
}): void {
	for (const moved of [...movedPaths].reverse()) {
		try {
			movePathToManagedDestination(fs, moved.to, moved.from, moved.kind);
		} catch (rollbackError) {
			logWarn(
				"unmapped-files",
				`Failed to roll back ${logLabel} for ${moved.from}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
			);
		}
	}
}

export function executeMappingWithRollback<TResult>({
	fs,
	logLabel,
	logWarn = defaultLogWarn,
	move,
	runTransaction,
}: ExecuteMappingInput<TResult>): TResult {
	const movedPaths: MappingMoveOperation[] = [];
	const recordMove = (operation: MappingMoveOperation): void => {
		movedPaths.push(operation);
	};

	try {
		move({ recordMove });
		return runTransaction();
	} catch (error) {
		rollbackMovedPaths({ fs, logLabel, logWarn, movedPaths });
		throw error;
	}
}
```

- [ ] **Step 4: Export and use executor in `src/server/unmapped-files.ts`**

At the top of `src/server/unmapped-files.ts`, add:

```ts
import {
	type MappingMoveOperation,
	executeMappingWithRollback,
} from "src/server/unmapped-file-mapping-executor";
```

Replace local `AssetOperation` uses that represent moved file paths with `MappingMoveOperation`. Leave asset-planning types in place when they include delete and prune behavior.

For the TV branch, replace the `try` block shape with this structure and move the branch's existing sidecar discovery loop and transaction statements into the named sections:

```ts
				try {
					executeMappingWithRollback({
						fs,
						logLabel: "TV file move",
						move: ({ recordMove }) => {
							moveFileToManagedPath(fs, file.path, managedEpisodePath);
							recordMove({
								from: file.path,
								kind: "file",
								to: managedEpisodePath,
							});

							const usedDestPaths = new Set([managedEpisodePath]);
							if (normalized.moveRelatedFiles && row.assets.length > 0) {
								plannedAssetRow = buildImportAssetPlan({
									contentType: "tv",
									destinationPathByRowId: new Map([
										[String(row.unmappedFileId), managedEpisodePath],
									]),
									filesByRowId: new Map([
										[String(row.unmappedFileId), { path: file.path }],
									]),
									requestedAssetsByRowId: new Map([
										[String(row.unmappedFileId), row.assets],
									]),
								}).get(String(row.unmappedFileId));

								if (plannedAssetRow) {
									assetOperations = buildAssetOperations({
										row: plannedAssetRow,
										deleteDeselectedAssets: normalized.deleteDeselectedRelatedFiles,
									});
									for (const move of assetOperations.moves) {
										movePathToManagedDestination(fs, move.from, move.to, move.kind);
										recordMove(move);
									}
								}
							}

							if (normalized.moveRelatedFiles && row.assets.length === 0) {
								const candidates = db
									.select()
									.from(unmappedFiles)
									.where(eq(unmappedFiles.rootFolderPath, file.rootFolderPath))
									.all();
								const relatedSidecars = candidates.filter(
									(candidate) =>
										candidate.id !== file.id &&
										!mappedIds.has(candidate.id) &&
										isRelatedTvSidecar(file.path, candidate.path),
								);
								const sidecarCollisionCounts = new Map<string, number>();

								for (const candidate of relatedSidecars) {
									const collisionKey = buildTvSidecarCollisionKey(
										managedEpisodePath,
										file.path,
										candidate.path,
									);
									sidecarCollisionCounts.set(
										collisionKey,
										(sidecarCollisionCounts.get(collisionKey) ?? 0) + 1,
									);
								}

								for (const candidate of relatedSidecars) {
									const collisionKey = buildTvSidecarCollisionKey(
										managedEpisodePath,
										file.path,
										candidate.path,
									);
									const sidecarDest = buildManagedTvSidecarPath(
										managedEpisodePath,
										file.path,
										candidate.path,
										usedDestPaths,
										(sidecarCollisionCounts.get(collisionKey) ?? 0) > 1,
									);
									moveFileToManagedPath(fs, candidate.path, sidecarDest);
									recordMove({
										from: candidate.path,
										kind: "file",
										to: sidecarDest,
									});
									usedDestPaths.add(sidecarDest);
									movedSidecarIds.push(candidate.id);
								}
							}
						},
						runTransaction: () => {
							db.transaction((tx) => {
								tx.insert(episodeFiles)
									.values({
										episodeId: row.entityId,
										path: managedEpisodePath,
										size: file.size,
										quality: file.quality,
										downloadProfileId: data.downloadProfileId,
										duration,
										codec,
										container,
									})
									.run();

								tx.insert(history)
									.values({
										eventType: "episodeFileAdded",
										episodeId: row.entityId,
										data: {
											path: managedEpisodePath,
											size: file.size,
											quality: file.quality?.quality?.name ?? "Unknown",
											source: "unmappedFileMapping",
										},
									})
									.run();

								tx.delete(unmappedFiles)
									.where(eq(unmappedFiles.id, file.id))
									.run();
								for (const sidecarId of movedSidecarIds) {
									tx.delete(unmappedFiles)
										.where(eq(unmappedFiles.id, sidecarId))
										.run();
								}
							});
						},
					});

					mappedCount++;
				} catch (error) {
					failures.push(toIssue({ error, file, row }));
					continue;
				}
```

Apply the same pattern to the book and movie branches:

- Move the branch's file and asset move logic into `move`.
- Replace `movedPaths.push(...)` and `movedFiles.push(...)` with `recordMove(...)`.
- Move each branch's `db.transaction((tx) => { ... })` statements into `runTransaction`.
- Remove direct calls to `rollbackMovedPaths` from the catch blocks.

- [ ] **Step 5: Remove the local rollback helper after all branches use the executor**

Delete the local `rollbackMovedPaths` function from `src/server/unmapped-files.ts`. Keep existing `moveFileToManagedPath` and `movePathToManagedDestination` because content branches still use their collision and destination semantics.

- [ ] **Step 6: Run Task 2 verification**

Run:

```bash
bun run test -- src/server/unmapped-file-mapping-executor.test.ts src/server/unmapped-files.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/server/unmapped-file-mapping-executor.ts src/server/unmapped-file-mapping-executor.test.ts src/server/unmapped-files.ts src/server/unmapped-files.test.ts
git commit -m "refactor(imports): extract unmapped mapping executor"
```

Expected: commit succeeds.

---

### Task 3: Split Auto-Search Search And Dispatch Helpers

**Files:**
- Create: `src/server/auto-search-indexer-search.ts`
- Create: `src/server/auto-search-indexer-search.test.ts`
- Create: `src/server/auto-search-download-dispatch.ts`
- Create: `src/server/auto-search-download-dispatch.test.ts`
- Modify: `src/server/auto-search.ts`
- Test: `src/server/auto-search.test.ts`

- [ ] **Step 1: Write helper tests for content-neutral indexer search**

Create `src/server/auto-search-indexer-search.test.ts`.

```ts
import { describe, expect, it, vi } from "vitest";
import { searchEnabledIndexers } from "src/server/auto-search-indexer-search";

describe("searchEnabledIndexers", () => {
	it("enriches successful manual and synced results while isolating per-indexer failures", async () => {
		const searchNewznab = vi
			.fn()
			.mockResolvedValueOnce([
				{
					title: "Synced Release",
					guid: "synced-guid",
					protocol: "usenet",
					size: 100,
					downloadUrl: "https://example.com/synced.nzb",
					quality: { id: 1, name: "EPUB", weight: 1 },
				},
			])
			.mockRejectedValueOnce(new Error("manual failed"));
		const logError = vi.fn();

		const releases = await searchEnabledIndexers({
			bookParams: { author: "Author", title: "Book" },
			canQueryIndexer: () => ({ allowed: true }),
			categories: [7020],
			contentType: "book",
			enabledIndexers: {
				manual: [
					{
						id: 2,
						name: "Manual",
						baseUrl: "https://manual.example",
						apiPath: "/api",
						apiKey: "manual-key",
					},
				],
				synced: [
					{
						id: 1,
						name: "Synced",
						baseUrl: "https://synced.example",
						apiPath: "/api",
						apiKey: "synced-key",
					},
				],
			},
			enrichRelease: (release) => release,
			logError,
			logInfo: vi.fn(),
			query: "Author Book",
			searchNewznab,
			sleep: vi.fn(),
		});

		expect(releases).toEqual([
			expect.objectContaining({
				allstarrIndexerId: 1,
				guid: "synced-guid",
				indexer: "Synced",
				indexerSource: "synced",
			}),
		]);
		expect(logError).toHaveBeenCalledWith(
			"rss-sync",
			expect.stringContaining("Manual"),
			expect.any(Error),
		);
	});
});
```

- [ ] **Step 2: Run the failing indexer-search helper test**

Run:

```bash
bun run test -- src/server/auto-search-indexer-search.test.ts
```

Expected: FAIL if the new test file was created because the helper module does not exist.

- [ ] **Step 3: Implement `indexer-search.ts`**

Create `src/server/auto-search-indexer-search.ts`.

```ts
import type { indexers, syncedIndexers } from "src/db/schema";
import type { IndexerRelease } from "src/server/search";

export type EnabledIndexers = {
	manual: Array<typeof indexers.$inferSelect>;
	synced: Array<typeof syncedIndexers.$inferSelect>;
};

type RateLimitGate =
	| { allowed: true }
	| { allowed: false; reason: string; waitMs?: number };

type SearchEnabledIndexersInput = {
	bookParams?: { author: string; title: string };
	canQueryIndexer: (
		source: "manual" | "synced",
		id: number,
	) => RateLimitGate;
	categories: number[];
	contentType?: "book" | "tv";
	enabledIndexers: EnabledIndexers;
	enrichRelease: (
		release: IndexerRelease,
		contentType?: "book" | "tv",
	) => IndexerRelease;
	logError: (scope: string, message: string, error: unknown) => void;
	logInfo: (scope: string, message: string) => void;
	logPrefix?: string;
	query: string;
	searchNewznab: (
		config: { baseUrl: string; apiPath: string; apiKey: string },
		query: string,
		categories: number[],
		bookParams: { author: string; title: string } | undefined,
		rateLimitIdentity: { indexerType: "manual" | "synced"; indexerId: number },
	) => Promise<IndexerRelease[]>;
	sleep: (ms: number) => Promise<void>;
};

export async function searchEnabledIndexers({
	bookParams,
	canQueryIndexer,
	categories,
	contentType,
	enabledIndexers,
	enrichRelease,
	logError,
	logInfo,
	logPrefix = "rss-sync",
	query,
	searchNewznab,
	sleep,
}: SearchEnabledIndexersInput): Promise<IndexerRelease[]> {
	const allReleases: IndexerRelease[] = [];

	for (const synced of enabledIndexers.synced.filter((s) => s.apiKey)) {
		const gate = canQueryIndexer("synced", synced.id);
		if (!gate.allowed) {
			if (gate.reason === "pacing" && gate.waitMs) {
				await sleep(gate.waitMs);
			} else {
				logInfo(logPrefix, `Indexer "${synced.name}" skipped: ${gate.reason}`);
				continue;
			}
		}

		try {
			const results = await searchNewznab(
				{
					baseUrl: synced.baseUrl,
					apiPath: synced.apiPath ?? "/api",
					apiKey: synced.apiKey ?? "",
				},
				query,
				categories,
				bookParams,
				{ indexerType: "synced", indexerId: synced.id },
			);
			allReleases.push(
				...results.map((release) =>
					enrichRelease(
						{
							...release,
							indexer: release.indexer || synced.name,
							allstarrIndexerId: synced.id,
							indexerSource: "synced",
						},
						contentType,
					),
				),
			);
		} catch (error) {
			logError(logPrefix, `Indexer "${synced.name}" failed`, error);
		}
	}

	for (const manual of enabledIndexers.manual) {
		const gate = canQueryIndexer("manual", manual.id);
		if (!gate.allowed) {
			if (gate.reason === "pacing" && gate.waitMs) {
				await sleep(gate.waitMs);
			} else {
				logInfo(logPrefix, `Indexer "${manual.name}" skipped: ${gate.reason}`);
				continue;
			}
		}

		try {
			const results = await searchNewznab(
				{
					baseUrl: manual.baseUrl,
					apiPath: manual.apiPath ?? "/api",
					apiKey: manual.apiKey,
				},
				query,
				categories,
				bookParams,
				{ indexerType: "manual", indexerId: manual.id },
			);
			allReleases.push(
				...results.map((release) =>
					enrichRelease(
						{
							...release,
							indexer: release.indexer || manual.name,
							allstarrIndexerId: manual.id,
							indexerSource: "manual",
						},
						contentType,
					),
				),
			);
		} catch (error) {
			logError(logPrefix, `Indexer "${manual.name}" failed`, error);
		}
	}

	return allReleases;
}
```

- [ ] **Step 4: Replace duplicated book search loops**

Modify `src/server/auto-search.ts`:

- Import `searchEnabledIndexers` and `EnabledIndexers`.
- Remove the local `EnabledIndexers` type.
- Replace the body of local `searchIndexers` with a call to `searchEnabledIndexers`.
- In `searchAndGrabForBook`, replace the two inline indexer loops with:

```ts
	const allReleases = await searchEnabledIndexers({
		bookParams,
		canQueryIndexer,
		categories,
		contentType: "book",
		enabledIndexers: ixs,
		enrichRelease,
		logError,
		logInfo,
		logPrefix: "rss-sync",
		query,
		searchNewznab,
		sleep,
	});
```

Keep `detail.searched = true` immediately after this call.

- [ ] **Step 5: Write failing dispatch helper tests**

Create `src/server/auto-search-download-dispatch.test.ts`.

```ts
import { describe, expect, it, vi } from "vitest";
import { dispatchAutoSearchDownload } from "src/server/auto-search-download-dispatch";

describe("dispatchAutoSearchDownload", () => {
	it("adds a download, tracks it, and records history through supplied repositories", async () => {
		const provider = {
			addDownload: vi.fn().mockResolvedValue("download-1"),
		};
		const insertTrackedDownload = vi.fn();
		const insertHistory = vi.fn();

		const result = await dispatchAutoSearchDownload({
			getProvider: vi.fn().mockResolvedValue(provider),
			insertHistory,
			insertTrackedDownload,
			logWarn: vi.fn(),
			release: {
				allstarrIndexerId: 5,
				downloadUrl: "https://example.com/release.nzb",
				guid: "guid-1",
				protocol: "usenet",
				quality: { id: 1, name: "EPUB", weight: 1 },
				size: 100,
				title: "Release",
			},
			resolveDownloadClient: () => ({
				client: {
					id: 9,
					name: "Client",
					implementation: "sabnzbd",
					host: "localhost",
					port: 8080,
					useSsl: false,
					urlBase: "",
					username: null,
					password: null,
					apiKey: "key",
					category: null,
					tag: "client-tag",
					settings: null,
				},
				combinedTag: "client-tag,indexer-tag",
			}),
			trackedDownload: ({ client, downloadId, release }) => ({
				downloadClientId: client.id,
				downloadId,
				releaseTitle: release.title,
				state: "queued",
			}),
			history: ({ client, release }) => ({
				eventType: "bookGrabbed",
				data: {
					downloadClientId: client.id,
					guid: release.guid,
					title: release.title,
				},
			}),
		});

		expect(result).toBe(true);
		expect(provider.addDownload).toHaveBeenCalledWith(
			expect.objectContaining({ implementation: "sabnzbd" }),
			expect.objectContaining({
				tag: "client-tag,indexer-tag",
				url: "https://example.com/release.nzb",
			}),
		);
		expect(insertTrackedDownload).toHaveBeenCalledWith(
			expect.objectContaining({ downloadId: "download-1" }),
		);
		expect(insertHistory).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: "bookGrabbed" }),
		);
	});
});
```

- [ ] **Step 6: Implement `download-dispatch.ts`**

Create `src/server/auto-search-download-dispatch.ts`.

```ts
import type { downloadClients } from "src/db/schema";
import type { ConnectionConfig } from "src/server/download-clients/types";
import type { IndexerRelease } from "src/server/search";

type DownloadClientRow = typeof downloadClients.$inferSelect;

type DispatchInput<TTrackedDownload, THistory> = {
	getProvider: (implementation: string) => Promise<{
		addDownload: (
			config: ConnectionConfig,
			download: {
				url: string;
				torrentData: null;
				nzbData: null;
				category: null;
				tag: string | null;
				savePath: null;
			},
		) => Promise<string | null>;
	}>;
	history: (input: {
		client: DownloadClientRow;
		release: IndexerRelease;
	}) => THistory;
	insertHistory: (row: THistory) => void;
	insertTrackedDownload: (row: TTrackedDownload) => void;
	logWarn: (scope: string, message: string) => void;
	release: IndexerRelease;
	resolveDownloadClient: (
		release: IndexerRelease,
	) => { client: DownloadClientRow; combinedTag: string | null } | null;
	trackedDownload: (input: {
		client: DownloadClientRow;
		downloadId: string;
		release: IndexerRelease;
	}) => TTrackedDownload;
};

function toConnectionConfig(client: DownloadClientRow): ConnectionConfig {
	return {
		implementation: client.implementation as ConnectionConfig["implementation"],
		host: client.host,
		port: client.port,
		useSsl: client.useSsl,
		urlBase: client.urlBase,
		username: client.username,
		password: client.password,
		apiKey: client.apiKey,
		category: client.category,
		tag: client.tag,
		settings: client.settings as Record<string, unknown> | null,
	};
}

export async function dispatchAutoSearchDownload<TTrackedDownload, THistory>({
	getProvider,
	history,
	insertHistory,
	insertTrackedDownload,
	logWarn,
	release,
	resolveDownloadClient,
	trackedDownload,
}: DispatchInput<TTrackedDownload, THistory>): Promise<boolean> {
	const resolved = resolveDownloadClient(release);
	if (!resolved) {
		logWarn(
			"auto-search",
			`No enabled ${release.protocol} download client for "${release.title}"`,
		);
		return false;
	}

	const { client, combinedTag } = resolved;
	const provider = await getProvider(client.implementation);
	const downloadId = await provider.addDownload(toConnectionConfig(client), {
		url: release.downloadUrl,
		torrentData: null,
		nzbData: null,
		category: null,
		tag: combinedTag,
		savePath: null,
	});

	if (downloadId) {
		insertTrackedDownload(trackedDownload({ client, downloadId, release }));
	}

	insertHistory(history({ client, release }));
	return true;
}
```

- [ ] **Step 7: Use the dispatch helper for movie and episode grabs**

In `src/server/auto-search.ts`, import `dispatchAutoSearchDownload` and replace the duplicated provider/config/addDownload/insert blocks in `grabReleaseForMovie` and `grabReleaseForEpisode`.

For movies:

```ts
	return dispatchAutoSearchDownload({
		getProvider,
		insertHistory: (row) => db.insert(history).values(row).run(),
		insertTrackedDownload: (row) => db.insert(trackedDownloads).values(row).run(),
		logWarn,
		release,
		resolveDownloadClient,
		trackedDownload: ({ client, downloadId, release }) => ({
			downloadClientId: client.id,
			downloadId,
			movieId: movie.id,
			downloadProfileId: profileId,
			releaseTitle: release.title,
			protocol: release.protocol,
			indexerId: release.allstarrIndexerId,
			guid: release.guid,
			state: "queued",
		}),
		history: ({ client, release }) => ({
			eventType: "movieGrabbed",
			movieId: movie.id,
			data: {
				title: release.title,
				guid: release.guid,
				indexerId: release.allstarrIndexerId,
				downloadClientId: client.id,
				downloadClientName: client.name,
				protocol: release.protocol,
				size: release.size,
				quality: release.quality.name,
				source: "autoSearch",
			},
		}),
	});
```

Use the same pattern for episodes with `eventType: "episodeGrabbed"`, `showId: episode.showId`, and `episodeId: episode.id`.

- [ ] **Step 8: Run Task 3 verification**

Run:

```bash
bun run test -- src/server/auto-search-indexer-search.test.ts src/server/auto-search-download-dispatch.test.ts src/server/auto-search.test.ts
bun run typecheck
```

Expected: PASS. If helper tests were added to `src/server/auto-search.test.ts` instead of new files, omit the missing helper test file paths.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add src/server/auto-search.ts src/server/auto-search-indexer-search.ts src/server/auto-search-indexer-search.test.ts src/server/auto-search-download-dispatch.ts src/server/auto-search-download-dispatch.test.ts src/server/auto-search.test.ts
git commit -m "refactor(search): split auto-search orchestration helpers"
```

Expected: commit succeeds.

---

### Task 4: Simplify Search Fixture Setup

**Files:**
- Create: `src/server/auto-search-test-fixtures.ts`
- Modify: `src/server/auto-search.test.ts`
- Modify: `src/server/__tests__/indexers.test.ts`

- [ ] **Step 1: Create named fixture builders**

Create `src/server/auto-search-test-fixtures.ts`.

```ts
import type { IndexerRelease } from "src/server/search";

export function buildRelease(
	overrides: Partial<IndexerRelease> = {},
): IndexerRelease {
	return {
		allstarrIndexerId: 1,
		downloadUrl: "https://indexer.example/download/1",
		guid: "release-guid",
		indexer: "Test Indexer",
		indexerSource: "manual",
		protocol: "usenet",
		quality: { id: 1, name: "EPUB", weight: 1 },
		size: 1024,
		title: "Test Release",
		...overrides,
	};
}

export function buildManualIndexer(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Manual Indexer",
		baseUrl: "https://manual.example",
		apiPath: "/api",
		apiKey: "manual-key",
		enableRss: true,
		priority: 25,
		protocol: "usenet",
		...overrides,
	};
}

export function buildSyncedIndexer(overrides: Record<string, unknown> = {}) {
	return {
		id: 2,
		name: "Synced Indexer",
		baseUrl: "https://synced.example",
		apiPath: "/api",
		apiKey: "synced-key",
		enableRss: true,
		priority: 25,
		protocol: "usenet",
		...overrides,
	};
}

export function buildDownloadClient(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Download Client",
		implementation: "sabnzbd",
		host: "localhost",
		port: 8080,
		useSsl: false,
		urlBase: "",
		username: null,
		password: null,
		apiKey: "client-key",
		category: null,
		tag: null,
		settings: null,
		enabled: true,
		priority: 1,
		protocol: "usenet",
		...overrides,
	};
}
```

- [ ] **Step 2: Refactor one brittle auto-search test setup**

In `src/server/auto-search.test.ts`, locate one test that uses a long `selectAll` call-order switch for indexer state around rate limiting or network failure. Replace literal release/indexer/client objects with the builders:

```ts
import {
	buildDownloadClient,
	buildManualIndexer,
	buildRelease,
	buildSyncedIndexer,
} from "src/server/auto-search-test-fixtures";
```

Change setup code from inline object literals to:

```ts
const release = buildRelease({
	guid: "network-failure-guid",
	title: "Network Failure Release",
});
const manualIndexer = buildManualIndexer({ id: 10, name: "Manual Failure" });
const syncedIndexer = buildSyncedIndexer({ id: 11, name: "Synced Success" });
const downloadClient = buildDownloadClient({ id: 20, name: "SABnzbd" });
```

Keep the original behavior assertions. Do not refactor unrelated tests in this step.

- [ ] **Step 3: Run the touched auto-search test**

Run the auto-search test file:

```bash
bun run test -- src/server/auto-search.test.ts
```

Expected: PASS.

- [ ] **Step 4: Refactor one brittle indexers test setup**

In `src/server/__tests__/indexers.test.ts`, replace one chained `mockReturnValueOnce` setup in a grab/search test with named local builders for request payload, release, synced indexer row, and download client row. Use this shape near the test:

```ts
const release = buildRelease({
	allstarrIndexerId: 7,
	guid: "grab-guid",
	title: "Grabbed Release",
});
const downloadClient = buildDownloadClient({
	id: 3,
	name: "Primary Client",
	protocol: release.protocol,
});
```

Import `buildRelease` and `buildDownloadClient` from `src/server/auto-search-test-fixtures.ts` in `src/server/__tests__/indexers.test.ts`. Keep the builders free of database imports so the test utility remains safe to share between server test files.

- [ ] **Step 5: Run the touched indexers test**

Run:

```bash
bun run test -- src/server/__tests__/indexers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run Task 4 verification**

Run:

```bash
bun run test -- src/server/auto-search.test.ts src/server/__tests__/indexers.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add src/server/auto-search-test-fixtures.ts src/server/auto-search.test.ts src/server/__tests__/indexers.test.ts
git commit -m "test(search): simplify search fixture setup"
```

Expected: commit succeeds.

---

### Task 5: Replace Fixed E2E Waits With Readiness Checks

**Files:**
- Create: `e2e/helpers/tasks.ts`
- Modify: `e2e/helpers/auth.ts`
- Modify: `e2e/helpers/sse.ts`
- Modify: `e2e/tests/06-auto-search.spec.ts`
- Modify: `e2e/tests/07-download-lifecycle.spec.ts`
- Modify: `e2e/tests/08-disk-scan.spec.ts`
- Modify: `e2e/tests/10-blocklist-failure.spec.ts`

- [ ] **Step 1: Create shared scheduled-task helper**

Create `e2e/helpers/tasks.ts`.

```ts
import { expect, type Page } from "@playwright/test";
import navigateTo from "./navigation";

export async function triggerScheduledTask(
	page: Page,
	appUrl: string,
	taskName: string,
): Promise<void> {
	await fetch(`${appUrl}/api/__test-reset`, { method: "POST" }).catch(() => {
		/* best-effort reset for stale running-task state */
	});

	await navigateTo(page, appUrl, "/system/tasks");

	const row = page.getByRole("row").filter({ hasText: taskName });
	await expect(row).toBeVisible({ timeout: 10_000 });

	const runButton = row.getByRole("button").last();
	await expect(runButton).toBeEnabled({ timeout: 5_000 });
	await runButton.click();

	await expect(async () => {
		const status = await row
			.getByText(/Running|Success|Error/)
			.first()
			.textContent();
		expect(status).not.toBe("Running");
	}).toPass({ timeout: 30_000 });

	await expect(row.getByText(/Success|Error/).first()).toBeVisible({
		timeout: 5_000,
	});
}
```

- [ ] **Step 2: Replace per-spec trigger helpers**

In each target e2e spec, remove the local `triggerTask` function and unused `Page` import if it becomes unused. Add:

```ts
import { triggerScheduledTask } from "../helpers/tasks";
```

Replace calls:

```ts
await triggerTask(page, appUrl, "Auto Search");
```

with:

```ts
await triggerScheduledTask(page, appUrl, "Auto Search");
```

Apply the same replacement in:

- `e2e/tests/06-auto-search.spec.ts`
- `e2e/tests/07-download-lifecycle.spec.ts`
- `e2e/tests/08-disk-scan.spec.ts`
- `e2e/tests/10-blocklist-failure.spec.ts`

- [ ] **Step 3: Remove auth helper fixed sleeps**

Modify `e2e/helpers/auth.ts`.

Replace `fillInput` with:

```ts
async function fillInput(locator: Locator, value: string): Promise<void> {
	await expect(locator).toBeEditable({ timeout: 10_000 });
	await locator.fill(value);
	await expect(locator).toHaveValue(value, { timeout: 5_000 });
}
```

Add this import:

```ts
import { expect, type Locator, type Page } from "@playwright/test";
```

Replace the start of `ensureAuthenticated`:

```ts
  await page.goto(`${baseUrl}/`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);
```

with:

```ts
  await page.goto(`${baseUrl}/`);
  await page.waitForLoadState("load");
  await waitForHydration(page);
```

- [ ] **Step 4: Add predicate-based SSE capture**

Modify `e2e/helpers/sse.ts`.

Change the function signature to:

```ts
export default async function captureSSEEvents(
	page: Page,
	baseUrl: string,
	eventTypes: string[],
	action: () => Promise<void>,
	options: {
		timeoutMs?: number;
		until?: (events: CapturedEvent[]) => boolean;
	} = {},
): Promise<CapturedEvent[]> {
	const timeoutMs = options.timeoutMs ?? 5000;
```

Replace `await page.waitForTimeout(timeoutMs);` with:

```ts
	if (options.until) {
		await page.waitForFunction(
			(predicateText) => {
				const globalWindow = window as typeof window & {
					__allstarrSseCapture?: {
						events: CapturedEvent[];
					};
				};
				const predicate = new Function(
					"events",
					`return (${predicateText})(events);`,
				) as (events: CapturedEvent[]) => boolean;
				return predicate(globalWindow.__allstarrSseCapture?.events ?? []);
			},
			options.until.toString(),
			{ timeout: timeoutMs },
		);
	}
```

Leave the final `page.evaluate` cleanup block after the predicate wait so the EventSource is always closed.

- [ ] **Step 5: Update SSE call sites**

Find SSE helper call sites:

```bash
rg -n "captureSSEEvents" e2e
```

For call sites that currently pass a numeric timeout as the fifth argument, convert to:

```ts
await captureSSEEvents(page, appUrl, ["queue"], action, {
	timeoutMs: 5_000,
	until: (events) => events.length > 0,
});
```

For call sites that need a specific event type:

```ts
await captureSSEEvents(page, appUrl, ["queue"], action, {
	timeoutMs: 5_000,
	until: (events) => events.some((event) => event.type === "queue"),
});
```

- [ ] **Step 6: Verify no target fixed waits remain**

Run:

```bash
rg -n "waitForTimeout" e2e/helpers/auth.ts e2e/helpers/sse.ts e2e/tests/06-auto-search.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/08-disk-scan.spec.ts e2e/tests/10-blocklist-failure.spec.ts
```

Expected: no matches.

- [ ] **Step 7: Run targeted e2e verification**

Run:

```bash
bun run test:e2e -- e2e/tests/06-auto-search.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/08-disk-scan.spec.ts e2e/tests/10-blocklist-failure.spec.ts
```

Expected: PASS. If Chromium is already installed, Playwright install step should be fast.

- [ ] **Step 8: Run Task 5 verification**

Run:

```bash
bun run typecheck
bun run lint
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

Run:

```bash
git add e2e/helpers/tasks.ts e2e/helpers/auth.ts e2e/helpers/sse.ts e2e/tests/06-auto-search.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/08-disk-scan.spec.ts e2e/tests/10-blocklist-failure.spec.ts
git commit -m "test(e2e): replace fixed waits with readiness checks"
```

Expected: commit succeeds.

---

## Final Verification

- [ ] **Step 1: Run full static checks**

```bash
bun run lint
bun run typecheck
```

Expected: both commands PASS.

- [ ] **Step 2: Run changed unit and browser test areas**

```bash
bun run test -- src/routes/api/v1/indexer/routes.test.ts src/routes/api/v1/indexer/schema.test.ts src/server/synced-indexers/resource-schema.test.ts src/server/unmapped-file-mapping-executor.test.ts src/server/unmapped-files.test.ts src/server/auto-search.test.ts src/server/auto-search-indexer-search.test.ts src/server/auto-search-download-dispatch.test.ts src/server/__tests__/indexers.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run targeted e2e tests**

```bash
bun run test:e2e -- e2e/tests/06-auto-search.spec.ts e2e/tests/07-download-lifecycle.spec.ts e2e/tests/08-disk-scan.spec.ts e2e/tests/10-blocklist-failure.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Inspect working tree**

```bash
git status --short
```

Expected: no uncommitted changes after the final checkpoint commit.
