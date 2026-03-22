import { createFileRoute } from "@tanstack/react-router";
import { db } from "src/db";
import * as schema from "src/db/schema";
import { invalidateFormatDefCache } from "src/server/indexers/format-parser";

/**
 * Test-only endpoint that executes DB operations on the app's own
 * Drizzle/bun:sqlite instance.  Only available when SQLITE_JOURNAL_MODE
 * is set (i.e. during E2E tests).
 */

type TableName = keyof typeof tableMap;

const tableMap = {
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
  downloadFormats: schema.downloadFormats,
  scheduledTasks: schema.scheduledTasks,
} as const;

function getTable(name: string) {
  if (!(name in tableMap)) {
    throw new Error(`Unknown table: ${name}`);
  }
  return tableMap[name as TableName];
}

export const Route = createFileRoute("/api/e2e-test-db")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // Guard: only available when app is running with a test database
        const dbUrl = process.env.DATABASE_URL ?? "";
        if (!dbUrl.includes("test-") && process.env.E2E_TEST_MODE !== "1") {
          return new Response("Not available", { status: 404 });
        }

        try {
          const body = await request.json();
          const { action } = body;

          switch (action) {
            case "insertReturning": {
              const table = getTable(body.table);
              const row = db.insert(table).values(body.data).returning().get();
              return Response.json({ ok: true, data: row });
            }

            case "delete": {
              const table = getTable(body.table);
              db.delete(table).run();
              return Response.json({ ok: true });
            }

            case "select": {
              const table = getTable(body.table);
              const rows = db.select().from(table).all();
              return Response.json({ ok: true, data: rows });
            }

            case "update": {
              const table = getTable(body.table);
              db.update(table).set(body.data).run();
              return Response.json({ ok: true });
            }

            case "resetCaches": {
              invalidateFormatDefCache();
              return Response.json({ ok: true });
            }

            default: {
              return Response.json(
                { ok: false, error: `Unknown action: ${action}` },
                { status: 400 },
              );
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return Response.json({ ok: false, error: message }, { status: 400 });
        }
      },
    },
  },
});
