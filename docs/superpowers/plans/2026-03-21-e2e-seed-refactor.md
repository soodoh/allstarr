# Plan: Refactor E2E Tests to Seed via App Server

**Goal:** Eliminate cross-driver SQLite issues by routing ALL test DB operations through the app server's `bun:sqlite` connection instead of using `better-sqlite3` directly.

## Problem

Tests use `better-sqlite3` (Node.js) to seed data, but the app uses `bun:sqlite` (Bun). Despite DELETE journal mode, checkpoints, and cache resets, 9 tests fail due to stale reads in the persistent `bun:sqlite` connection. The root cause is two different SQLite drivers sharing one file.

## Solution

Create a test-only API endpoint on the app server that accepts Drizzle-style operations. Rewrite all test DB operations (seed, cleanup, assertion queries) to call this endpoint. Remove `better-sqlite3` from the test infrastructure entirely.

---

## Phase 1: Create Test DB API Endpoint

**File:** `src/routes/api/__test-db.ts`

Create a POST endpoint that accepts operations and executes them on the app's `bun:sqlite` Drizzle instance. Only available when `SQLITE_JOURNAL_MODE` env is set.

### Operations to support:

```typescript
type TestDbOperation =
  | { action: "insert"; table: string; data: Record<string, unknown> }
  | { action: "insertReturning"; table: string; data: Record<string, unknown> }
  | { action: "delete"; table: string }
  | { action: "select"; table: string; where?: Record<string, unknown> }
  | { action: "update"; table: string; data: Record<string, unknown> }
  | { action: "resetCaches" };
```

The endpoint imports `* as schema` and uses `db` from `src/db` to execute operations. For `insertReturning`, it returns the inserted row. For `select`, it returns matching rows.

### Table name mapping:

Map string table names to Drizzle schema objects:

```typescript
const tables: Record<string, any> = {
  authors: schema.authors,
  books: schema.books,
  editions: schema.editions,
  booksAuthors: schema.booksAuthors,
  downloadProfiles: schema.downloadProfiles,
  downloadClients: schema.downloadClients,
  indexers: schema.indexers,
  syncedIndexers: schema.syncedIndexers,
  editionDownloadProfiles: schema.editionDownloadProfiles,
  authorDownloadProfiles: schema.authorDownloadProfiles,
  trackedDownloads: schema.trackedDownloads,
  blocklist: schema.blocklist,
  bookFiles: schema.bookFiles,
  history: schema.history,
  settings: schema.settings,
};
```

### Verification:

- Start app server, POST to `/api/__test-db` with an insert, then GET with select
- Confirm data round-trips correctly

---

## Phase 2: Create Test-Side DB Client

**File:** `e2e/fixtures/test-db-client.ts`

Create a client class that wraps HTTP calls to `/api/__test-db`:

```typescript
class TestDbClient {
  constructor(private appUrl: string) {}

  async insert(table: string, data: Record<string, unknown>): Promise<any> { ... }
  async select(table: string, where?: Record<string, unknown>): Promise<any[]> { ... }
  async deleteAll(table: string): Promise<void> { ... }
  async update(table: string, data: Record<string, unknown>): Promise<void> { ... }
  async resetCaches(): Promise<void> { ... }
}
```

### Verification:

- Unit test the client against the running app server

---

## Phase 3: Rewrite seed-data.ts

**File:** `e2e/fixtures/seed-data.ts`

Change all seed functions from:

```typescript
export function seedAuthor(db: Db, overrides = {}) {
  return db.insert(schema.authors).values({...}).returning().all()[0];
}
```

To:

```typescript
export async function seedAuthor(client: TestDbClient, overrides = {}) {
  return client.insert("authors", { ...defaults, ...overrides });
}
```

Key changes:

- All functions become `async` (HTTP calls)
- First param changes from `db: Db` to `client: TestDbClient`
- `seedBook` also inserts into `booksAuthors` (two insert calls)
- `seedSetting` uses upsert logic (delete + insert)

### Verification:

- Seed functions return correct data types
- Foreign key relationships work (e.g., seedBook creates booksAuthors row)

---

## Phase 4: Rewrite App Fixture

**File:** `e2e/fixtures/app.ts`

Remove:

- `better-sqlite3` import and usage
- `db` fixture (BetterSQLite3Database)
- `checkpoint()` fixture
- `SQLITE_JOURNAL_MODE` env var (no longer needed)

Add:

- `testDb: TestDbClient` fixture (test-scoped, uses appUrl)

Change:

- `beforeEach` to call `testDb.resetCaches()` instead of checkpoint
- Remove journal mode from test-db.ts

**File:** `e2e/fixtures/test-db.ts`

Remove:

- `better-sqlite3` import
- `createTestDb` — replace with simple file copy (still need template DB for schema)
- `checkpoint()` method
- DB connection management

Keep:

- `getTestState()` (reads .test-state.json)
- `TestDbHandle` — simplified to just `{ dbPath, cleanup }`

### Verification:

- App fixture compiles
- `testDb` fixture provides working client

---

## Phase 5: Update All Test Files

Update all 10 test spec files to use the new patterns:

### Signature changes in beforeEach:

```typescript
// Before:
test.beforeEach(async ({ page, appUrl, db, fakeServers, checkpoint }) => {
  db.delete(schema.trackedDownloads).run();
  seedAuthor(db, { name: "Test" });
  checkpoint();
});

// After:
test.beforeEach(async ({ page, appUrl, testDb, fakeServers }) => {
  await testDb.deleteAll("trackedDownloads");
  await seedAuthor(testDb, { name: "Test" });
});
```

### Assertion changes:

```typescript
// Before:
const tracked = db.select().from(schema.trackedDownloads).all();

// After:
const tracked = await testDb.select("trackedDownloads");
```

### Files to update:

1. `e2e/tests/02-settings-config.spec.ts`
2. `e2e/tests/03-author-book-import.spec.ts`
3. `e2e/tests/04-search-grab.spec.ts`
4. `e2e/tests/05-queue-management.spec.ts`
5. `e2e/tests/06-auto-search.spec.ts`
6. `e2e/tests/07-download-lifecycle.spec.ts`
7. `e2e/tests/08-disk-scan.spec.ts`
8. `e2e/tests/09-system-health.spec.ts`
9. `e2e/tests/10-blocklist-failure.spec.ts`
10. `e2e/tests/01-auth.spec.ts` (no db ops, but imports may change)

### Verification:

- All tests compile (no TypeScript errors)
- No remaining `better-sqlite3` imports in test files

---

## Phase 6: Remove Workarounds and Verify

Remove:

- `SQLITE_JOURNAL_MODE` env var from app fixture
- `SQLITE_JOURNAL_MODE` handling from `src/db/index.ts` (revert to always WAL)
- `checkpoint()` fixture and calls
- WAL warm-up navigations (any remaining)
- `better-sqlite3` from test-db.ts
- `@types/better-sqlite3` from devDependencies (if only used by tests)

### Final verification:

```bash
bun run test:e2e -- --workers=1
```

All 100 tests should pass. Then run with default workers to check parallelism.

---

## Key Decisions

1. **Single endpoint vs multiple:** One `/api/__test-db` endpoint handles all operations. Simpler than creating per-table endpoints.

2. **Raw SQL vs Drizzle:** Use Drizzle on the server side (typed, safe). The endpoint maps table names to schema objects.

3. **Async seed functions:** All seed functions become async. Tests already use async/await extensively so this is natural.

4. **Keep template DB:** Still use `db:push` to create schema. The template is copied per worker for isolation. Only the DB _connection_ changes (from better-sqlite3 to HTTP→bun:sqlite).

5. **Keep assertion queries via endpoint:** Tests still verify DB state, but through the HTTP endpoint instead of direct better-sqlite3 queries. This ensures tests see the same data the app sees.
