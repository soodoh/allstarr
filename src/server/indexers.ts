import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db";
import { indexers, downloadClients, history, books, authors } from "~/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createIndexerSchema,
  updateIndexerSchema,
  testIndexerSchema,
  searchIndexersSchema,
  grabReleaseSchema,
} from "~/lib/validators";
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
        settings: data.settings as Record<string, unknown> | undefined,
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
        settings: values.settings as Record<string, unknown> | undefined,
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
      urlBase: indexer.urlBase ?? undefined,
      apiKey: indexer.apiKey,
    });
  });

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchIndexersFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchIndexersSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Get all enabled indexers sorted by priority (lower number = higher priority)
    const enabledIndexers = db
      .select()
      .from(indexers)
      .where(eq(indexers.enabled, true))
      .orderBy(asc(indexers.priority))
      .all();

    if (enabledIndexers.length === 0) {
      return [] as IndexerRelease[];
    }

    let query = data.query;

    // If bookId provided, build a better query using book + author info
    if (data.bookId) {
      const book = db
        .select({
          title: books.title,
          authorName: authors.name,
        })
        .from(books)
        .leftJoin(authors, eq(books.authorId, authors.id))
        .where(eq(books.id, data.bookId))
        .get();

      if (book) {
        query = `${book.authorName ? `${book.authorName} ` : ""}${book.title}`;
      }
    }

    const categories = data.categories ?? [7020];

    // Fan out to all enabled indexers in parallel
    const results = await Promise.allSettled(
      enabledIndexers.map(async (indexer) => {
        const rawResults = await prowlarrHttp.searchProwlarr(
          {
            host: indexer.host,
            port: indexer.port,
            useSsl: indexer.useSsl,
            urlBase: indexer.urlBase ?? undefined,
            apiKey: indexer.apiKey,
          },
          query,
          categories,
        );

        return rawResults.map((r) =>
          enrichRelease({
            ...r,
            allstarrIndexerId: indexer.id,
          }),
        );
      }),
    );

    // Flatten results, ignore failures
    const allReleases: IndexerRelease[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allReleases.push(...result.value);
      }
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
      if (qualityDiff !== 0) {return qualityDiff;}
      return b.size - a.size;
    });

    return unique;
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
      implementation: client.implementation as ConnectionConfig["implementation"],
      host: client.host,
      port: client.port,
      useSsl: client.useSsl,
      urlBase: client.urlBase ?? undefined,
      username: client.username ?? undefined,
      password: client.password ?? undefined,
      apiKey: client.apiKey ?? undefined,
      category: client.category,
      settings: client.settings as Record<string, unknown> | undefined,
    };

    await provider.addDownload(config, { url: data.downloadUrl });

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
