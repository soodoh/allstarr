// src/server/manga-search.ts
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { db } from "src/db";
import { manga, mangaSources } from "src/db/schema";
import {
	checkMangaExistsSchema,
	mangaSourceConfigSchema,
	searchMangaSourcesSchema,
} from "src/lib/validators";
import {
	getAllSourceDefinitions,
	getEnabledSources,
	setSourceConfig,
	setSourceEnabled,
} from "./manga-sources";
import { requireAuth } from "./middleware";

export type MangaSearchResult = {
	sourceId: string;
	sourceName: string;
	url: string;
	title: string;
	thumbnailUrl?: string;
};

export const searchMangaSourcesFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => searchMangaSourcesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		const sources = getEnabledSources();

		if (sources.length === 0) {
			return {
				results: [] as MangaSearchResult[],
				error:
					"No manga sources enabled. Enable sources in Settings > Manga Sources.",
			};
		}

		// Search all enabled sources concurrently
		const searchResults = await Promise.allSettled(
			sources.map(async (source) => {
				const page = await source.searchManga(1, data.query);
				return page.manga.map((m) => ({
					sourceId: source.id,
					sourceName: source.name,
					url: m.url,
					title: m.title,
					thumbnailUrl: m.thumbnailUrl,
				}));
			}),
		);

		const results: MangaSearchResult[] = [];
		for (const result of searchResults) {
			if (result.status === "fulfilled") {
				results.push(...result.value);
			}
		}

		return { results, error: null };
	});

export const checkMangaExistsFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => checkMangaExistsSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		const existing = db
			.select({ id: manga.id })
			.from(manga)
			.where(
				and(
					eq(manga.sourceId, data.sourceId),
					eq(manga.sourceMangaUrl, data.sourceMangaUrl),
				),
			)
			.get();
		return { exists: Boolean(existing), mangaId: existing?.id ?? null };
	});

// Source management server functions for the settings page
export const getMangaSourceListFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();
		const defs = getAllSourceDefinitions();
		const dbRows = db.select().from(mangaSources).all();
		const dbMap = new Map(dbRows.map((r) => [r.sourceId, r]));

		return defs.map((d) => {
			const row = dbMap.get(d.id);
			const rawConfig = row?.config;
			return {
				id: d.id,
				name: d.name,
				lang: d.lang,
				group: d.group,
				enabled: row?.enabled ?? false,
				config: rawConfig ? JSON.parse(rawConfig) : null,
			};
		});
	},
);

export const updateMangaSourceFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => mangaSourceConfigSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		if (data.enabled !== undefined) {
			setSourceEnabled(data.sourceId, data.enabled);
		}
		if (data.config) {
			setSourceConfig(data.sourceId, data.config);
		}
		return { success: true };
	});
