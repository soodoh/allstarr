import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  indexers,
  syncedIndexers,
  downloadClients,
  history,
  books,
  booksAuthors,
} from "src/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createIndexerSchema,
  updateIndexerSchema,
  testIndexerSchema,
  searchIndexersSchema,
  grabReleaseSchema,
} from "src/lib/validators";
import * as prowlarrHttp from "./indexers/http";
import { enrichRelease } from "./indexers/quality-parser";
import getProvider from "./download-clients/registry";
import type { IndexerRelease } from "./indexers/types";
import type { ConnectionConfig } from "./download-clients/types";

// ─── CRUD ────────────────────────────────────────────────────────────────────

export const getIndexersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(indexers).all();
  },
);

export const getIndexerFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(indexers)
      .where(eq(indexers.id, data.id))
      .get();
    if (!result) {
      throw new Error("Indexer not found");
    }
    return result;
  });

export const createIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createIndexerSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .insert(indexers)
      .values({
        ...data,
        settings: data.settings as Record<string, unknown> | null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .returning()
      .get();
  });

export const updateIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateIndexerSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    return db
      .update(indexers)
      .set({
        ...values,
        settings: values.settings as Record<string, unknown> | null,
        updatedAt: Date.now(),
      })
      .where(eq(indexers.id, id))
      .returning()
      .get();
  });

export const deleteIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(indexers).where(eq(indexers.id, data.id)).run();
    return { success: true };
  });

export const getSyncedIndexersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db
      .select()
      .from(syncedIndexers)
      .orderBy(asc(syncedIndexers.name))
      .all();
  },
);

// ─── Connection Test ──────────────────────────────────────────────────────────

export const testIndexerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => testIndexerSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return prowlarrHttp.testConnection({
      host: data.host,
      port: data.port,
      useSsl: data.useSsl,
      urlBase: data.urlBase,
      apiKey: data.apiKey,
    });
  });

// ─── List Prowlarr's own indexers ─────────────────────────────────────────────

export const listProwlarrIndexersFn = createServerFn({ method: "POST" })
  .inputValidator((d: { indexerId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const indexer = db
      .select()
      .from(indexers)
      .where(eq(indexers.id, data.indexerId))
      .get();
    if (!indexer) {
      throw new Error("Indexer not found");
    }
    return prowlarrHttp.listProwlarrIndexers({
      host: indexer.host,
      port: indexer.port,
      useSsl: indexer.useSsl,
      urlBase: indexer.urlBase,
      apiKey: indexer.apiKey,
    });
  });

// ─── Enabled-indexer check ────────────────────────────────────────────────────

export const hasEnabledIndexersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const manualCount = db
      .select()
      .from(indexers)
      .where(eq(indexers.enabled, true))
      .all().length;
    if (manualCount > 0) {
      return true;
    }

    const syncedCount = db
      .select()
      .from(syncedIndexers)
      .where(eq(syncedIndexers.enableSearch, true))
      .all().length;
    return syncedCount > 0;
  },
);

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchIndexersFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchIndexersSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Get all enabled manual indexers sorted by priority
    const enabledManual = db
      .select()
      .from(indexers)
      .where(eq(indexers.enabled, true))
      .orderBy(asc(indexers.priority))
      .all();

    // Get synced indexers with search enabled — each maps to an individual
    // Prowlarr Newznab/Torznab proxy feed (e.g. http://prowlarr:9696/1/api).
    const enabledSynced = db
      .select()
      .from(syncedIndexers)
      .where(eq(syncedIndexers.enableSearch, true))
      .orderBy(asc(syncedIndexers.priority))
      .all();

    if (enabledManual.length === 0 && enabledSynced.length === 0) {
      return { releases: [] as IndexerRelease[], warnings: [] };
    }

    let query = data.query;

    // If bookId provided and no explicit query, build a default query from book info
    if (data.bookId && !data.query) {
      const book = db
        .select({
          title: books.title,
          authorName: booksAuthors.authorName,
        })
        .from(books)
        .leftJoin(
          booksAuthors,
          and(
            eq(booksAuthors.bookId, books.id),
            eq(booksAuthors.isPrimary, true),
          ),
        )
        .where(eq(books.id, data.bookId))
        .get();

      if (book) {
        query = `${book.authorName ? `${book.authorName} ` : ""}${book.title}`;
      }
    }

    const categories = data.categories ?? [7000, 7020];

    // ── Per-indexer Newznab feed searches (like Readarr) ──────────────────
    // Each synced indexer has its own Newznab/Torznab proxy feed URL from
    // Prowlarr.  Querying each feed individually avoids Prowlarr's internal
    // category-capability filter that silently skips indexers whose caps
    // don't advertise the requested categories.
    const feedSearches = enabledSynced
      .filter((s) => s.apiKey)
      .map(async (synced) => {
        const results = await prowlarrHttp.searchNewznab(
          {
            baseUrl: synced.baseUrl,
            apiPath: synced.apiPath ?? "/api",
            apiKey: synced.apiKey!,
          },
          query,
          categories,
        );
        return results.map((r) =>
          enrichRelease({
            ...r,
            indexer: r.indexer || synced.name,
            allstarrIndexerId: synced.id,
          }),
        );
      });

    // ── Fallback: Prowlarr internal API for manual indexers ───────────────
    // Manual indexers are raw Prowlarr connections without individual feed
    // URLs.  Use the internal search API as a fallback.
    const internalSearches = enabledManual.map(async (ix) => {
      const results = await prowlarrHttp.searchProwlarr(
        {
          host: ix.host,
          port: ix.port,
          useSsl: ix.useSsl,
          urlBase: ix.urlBase,
          apiKey: ix.apiKey,
        },
        query,
        categories,
      );
      return results.map((r) =>
        enrichRelease({ ...r, allstarrIndexerId: ix.id }),
      );
    });

    // Fan out all searches in parallel
    const settled = await Promise.allSettled([
      ...feedSearches,
      ...internalSearches,
    ]);

    // Flatten results, collect warnings from failures
    const allReleases: IndexerRelease[] = [];
    const warnings: string[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        allReleases.push(...result.value);
      } else {
        warnings.push(
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown indexer error",
        );
      }
    }

    // If every indexer failed, throw so the client sees an error
    if (settled.length > 0 && allReleases.length === 0 && warnings.length > 0) {
      throw new Error(
        `All indexers failed: ${warnings.join("; ")}`,
      );
    }

    // Deduplicate by guid
    const seen = new Set<string>();
    const unique: IndexerRelease[] = [];
    for (const release of allReleases) {
      if (!seen.has(release.guid)) {
        seen.add(release.guid);
        unique.push(release);
      }
    }

    // Sort by quality weight descending, then by size descending
    unique.sort((a, b) => {
      const qualityDiff = b.quality.weight - a.quality.weight;
      if (qualityDiff !== 0) {
        return qualityDiff;
      }
      return b.size - a.size;
    });

    return { releases: unique, warnings };
  });

// ─── Grab ─────────────────────────────────────────────────────────────────────

export const grabReleaseFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => grabReleaseSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    let client;

    if (data.downloadClientId) {
      // Use explicitly specified download client
      client = db
        .select()
        .from(downloadClients)
        .where(eq(downloadClients.id, data.downloadClientId))
        .get();
      if (!client) {
        throw new Error("Download client not found");
      }
    } else {
      // Auto-select best enabled download client matching the release protocol
      const matchingClients = db
        .select()
        .from(downloadClients)
        .where(eq(downloadClients.enabled, true))
        .orderBy(asc(downloadClients.priority))
        .all()
        .filter((c) => c.protocol === data.protocol);

      if (matchingClients.length === 0) {
        throw new Error(
          `No enabled ${data.protocol} download clients configured. Please add one in Settings > Download Clients.`,
        );
      }
      client = matchingClients[0];
    }

    const provider = getProvider(client.implementation);
    const config: ConnectionConfig = {
      implementation:
        client.implementation as ConnectionConfig["implementation"],
      host: client.host,
      port: client.port,
      useSsl: client.useSsl,
      urlBase: client.urlBase,
      username: client.username,
      password: client.password,
      apiKey: client.apiKey,
      category: client.category,
      settings: client.settings as Record<string, unknown> | null,
    };

    await provider.addDownload(config, {
      url: data.downloadUrl,
      torrentData: null,
      nzbData: null,
      category: null,
      savePath: null,
    });

    // Record history event
    db.insert(history)
      .values({
        eventType: "bookGrabbed",
        bookId: data.bookId ?? null,
        data: {
          title: data.title,
          guid: data.guid,
          indexerId: data.indexerId,
          downloadClientId: client.id,
          downloadClientName: client.name,
          protocol: data.protocol,
          size: data.size,
        },
      })
      .run();

    return {
      success: true,
      downloadClientName: client.name,
    };
  });
