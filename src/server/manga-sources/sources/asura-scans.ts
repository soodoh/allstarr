import { ApiEngine } from "../engines/api-engine";
import { registerSource } from "../registry";
import type {
	FilterList,
	MangaDetails,
	MangaPage,
	PageUrl,
	SourceChapter,
	SourceManga,
} from "../types";

// --- AsuraScans API response types ---

type AsuraSeries = {
	id: number;
	slug: string;
	title: string;
	description?: string;
	status?: string;
	thumbnail?: string;
	rating?: number;
	type?: string;
	genres?: Array<{ name: string }>;
};

type AsuraSeriesResponse = {
	data: AsuraSeries[];
	meta?: {
		current_page: number;
		last_page: number;
		per_page: number;
		total: number;
	};
};

type AsuraChapter = {
	id: number;
	slug: string;
	chapter_number: number;
	chapter_title: string | null;
	created_at: string;
};

type AsuraSeriesDetail = {
	id: number;
	slug: string;
	title: string;
	description?: string;
	status?: string;
	thumbnail?: string;
	type?: string;
	author?: string;
	artist?: string;
	genres?: Array<{ name: string }>;
	chapters?: AsuraChapter[];
};

type AsuraChapterPage = {
	url: string;
	order: number;
};

// --- Constants ---

// NOTE: AsuraScans frequently changes domains and API structure — endpoints may need updating
const ASURA_BASE = "https://asurascans.com";
const ASURA_API = `${ASURA_BASE}/api`;
const PAGE_SIZE = 20;

// --- Helper functions ---

function mapStatus(status?: string): MangaDetails["status"] | undefined {
	switch (status?.toLowerCase()) {
		case "ongoing": {
			return "ongoing";
		}
		case "completed":
		case "complete": {
			return "complete";
		}
		case "hiatus": {
			return "hiatus";
		}
		case "cancelled":
		case "dropped": {
			return "cancelled";
		}
		default: {
			return undefined;
		}
	}
}

function mapType(type?: string): MangaDetails["type"] | undefined {
	switch (type?.toLowerCase()) {
		case "manhwa": {
			return "manhwa";
		}
		case "manhua": {
			return "manhua";
		}
		case "manga": {
			return "manga";
		}
		default: {
			return "manhwa"; // AsuraScans primarily hosts manhwa
		}
	}
}

function seriesToSourceManga(series: AsuraSeries): SourceManga {
	return {
		url: `/series/${series.slug}`,
		title: series.title,
		thumbnailUrl: series.thumbnail,
	};
}

// --- AsuraScans source ---

class AsuraScansSource extends ApiEngine {
	constructor() {
		super({
			id: "asura-scans",
			name: "Asura Scans",
			baseUrl: ASURA_BASE,
			lang: "en",
			supportsLatest: true,
			rateLimit: { maxRequests: 2, windowMs: 1000 },
		});
	}

	async searchManga(
		page: number,
		query: string,
		_filters?: FilterList,
	): Promise<MangaPage> {
		// NOTE: search parameter name may differ across API versions
		const url =
			`${ASURA_API}/series?search=${encodeURIComponent(query)}` +
			`&page=${page}`;

		const data = await this.fetchJson<AsuraSeriesResponse>(url);
		return {
			manga: data.data.map(seriesToSourceManga),
			hasNextPage: data.meta
				? data.meta.current_page < data.meta.last_page
				: data.data.length >= PAGE_SIZE,
		};
	}

	async getPopularManga(page: number): Promise<MangaPage> {
		// NOTE: order parameter may differ across API versions
		const url = `${ASURA_API}/series?order=rating&page=${page}`;

		const data = await this.fetchJson<AsuraSeriesResponse>(url);
		return {
			manga: data.data.map(seriesToSourceManga),
			hasNextPage: data.meta
				? data.meta.current_page < data.meta.last_page
				: data.data.length >= PAGE_SIZE,
		};
	}

	async getLatestUpdates(page: number): Promise<MangaPage> {
		// NOTE: order parameter may differ across API versions
		const url = `${ASURA_API}/series?order=update&page=${page}`;

		const data = await this.fetchJson<AsuraSeriesResponse>(url);
		return {
			manga: data.data.map(seriesToSourceManga),
			hasNextPage: data.meta
				? data.meta.current_page < data.meta.last_page
				: data.data.length >= PAGE_SIZE,
		};
	}

	async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
		const slug = mangaUrl.replace(/^\/series\//, "");
		const url = `${ASURA_API}/series/${slug}`;

		const data = await this.fetchJson<AsuraSeriesDetail>(url);

		const genres = (data.genres ?? []).map((g) => g.name);

		return {
			title: data.title,
			author: data.author,
			artist: data.artist,
			description: data.description,
			genres: genres.length > 0 ? genres : undefined,
			status: mapStatus(data.status),
			type: mapType(data.type),
			thumbnailUrl: data.thumbnail,
		};
	}

	async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
		const slug = mangaUrl.replace(/^\/series\//, "");

		// Chapters are typically included in the series detail response
		const url = `${ASURA_API}/series/${slug}`;
		const data = await this.fetchJson<AsuraSeriesDetail>(url);

		if (!data.chapters || data.chapters.length === 0) {
			return [];
		}

		return data.chapters.map((ch) => {
			const name = ch.chapter_title
				? `Chapter ${ch.chapter_number}: ${ch.chapter_title}`
				: `Chapter ${ch.chapter_number}`;

			return {
				url: `/series/${slug}/chapter/${ch.slug}`,
				name,
				chapterNumber: ch.chapter_number,
				dateUpload: new Date(ch.created_at),
			};
		});
	}

	async getPageList(chapterUrl: string): Promise<PageUrl[]> {
		// NOTE: pages may be embedded as JSON in SSR HTML — this endpoint may need adjustment
		const url = `${ASURA_BASE}/api${chapterUrl}/pages`;

		const cacheKey = `asura-pages:${chapterUrl}:${Date.now()}`;
		const data = await this.fetchJson<AsuraChapterPage[]>(url, cacheKey);

		return data.toSorted((a, b) => a.order - b.order).map((p) => p.url);
	}
}

registerSource({
	id: "asura-scans",
	name: "Asura Scans",
	lang: "en",
	group: "api",
	factory: () => new AsuraScansSource(),
});
