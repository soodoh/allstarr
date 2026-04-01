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

// --- MangaDex API response types ---

type MangaDexRelationship = {
	id: string;
	type: string;
	attributes?: Record<string, unknown>;
};

type MangaDexMangaAttributes = {
	title: Record<string, string>;
	description?: Record<string, string>;
	status?: string;
	originalLanguage?: string;
	tags?: Array<{
		attributes?: { name?: Record<string, string> };
	}>;
	lastChapter?: string;
	lastVolume?: string;
};

type MangaDexManga = {
	id: string;
	type: string;
	attributes: MangaDexMangaAttributes;
	relationships: MangaDexRelationship[];
};

type MangaDexChapterAttributes = {
	chapter: string | null;
	volume: string | null;
	title: string | null;
	translatedLanguage: string;
	externalUrl: string | null;
	publishAt: string;
	pages: number;
};

type MangaDexChapter = {
	id: string;
	attributes: MangaDexChapterAttributes;
	relationships: MangaDexRelationship[];
};

type MangaDexListResponse<T> = {
	result: string;
	data: T[];
	total: number;
	limit: number;
	offset: number;
};

type MangaDexAtHomeResponse = {
	baseUrl: string;
	chapter: {
		hash: string;
		data: string[];
		dataSaver: string[];
	};
};

// --- Helper functions ---

const MANGADEX_BASE = "https://api.mangadex.org";
const COVERS_BASE = "https://uploads.mangadex.org/covers";
const PAGE_SIZE = 20;
const CHAPTER_PAGE_SIZE = 500;

function extractTitle(title: Record<string, string>): string {
	if (title.en) {
		return title.en;
	}
	const keys = Object.keys(title);
	return keys.length > 0 ? title[keys[0]] : "Unknown Title";
}

function extractCoverUrl(
	mangaId: string,
	relationships: MangaDexRelationship[],
): string | undefined {
	const coverRel = relationships.find((r) => r.type === "cover_art");
	if (!coverRel?.attributes) {
		return undefined;
	}
	const fileName = coverRel.attributes.fileName as string | undefined;
	if (!fileName) {
		return undefined;
	}
	return `${COVERS_BASE}/${mangaId}/${fileName}.256.jpg`;
}

function extractPersonName(
	relationships: MangaDexRelationship[],
	type: string,
): string | undefined {
	const rel = relationships.find((r) => r.type === type);
	if (!rel?.attributes) {
		return undefined;
	}
	return rel.attributes.name as string | undefined;
}

function mapStatus(status?: string): MangaDetails["status"] | undefined {
	switch (status) {
		case "ongoing": {
			return "ongoing";
		}
		case "completed": {
			return "complete";
		}
		case "hiatus": {
			return "hiatus";
		}
		case "cancelled": {
			return "cancelled";
		}
		default: {
			return undefined;
		}
	}
}

function mapType(originalLanguage?: string): MangaDetails["type"] | undefined {
	switch (originalLanguage) {
		case "ko": {
			return "manhwa";
		}
		case "zh":
		case "zh-hk": {
			return "manhua";
		}
		default: {
			return "manga";
		}
	}
}

function mangaToSourceManga(manga: MangaDexManga): SourceManga {
	return {
		url: `/manga/${manga.id}`,
		title: extractTitle(manga.attributes.title),
		thumbnailUrl: extractCoverUrl(manga.id, manga.relationships),
	};
}

// --- MangaDex source ---

class MangaDexSource extends ApiEngine {
	constructor() {
		super({
			id: "mangadex",
			name: "MangaDex",
			baseUrl: MANGADEX_BASE,
			lang: "all",
			supportsLatest: true,
			rateLimit: { maxRequests: 3, windowMs: 1000 },
		});
	}

	async searchManga(
		page: number,
		query: string,
		_filters?: FilterList,
	): Promise<MangaPage> {
		const offset = (page - 1) * PAGE_SIZE;
		const url =
			`${this.baseUrl}/manga?title=${encodeURIComponent(query)}` +
			`&limit=${PAGE_SIZE}&offset=${offset}` +
			`&includes[]=cover_art&order[relevance]=desc`;

		const data = await this.fetchJson<MangaDexListResponse<MangaDexManga>>(url);
		return {
			manga: data.data.map(mangaToSourceManga),
			hasNextPage: offset + data.limit < data.total,
		};
	}

	async getPopularManga(page: number): Promise<MangaPage> {
		const offset = (page - 1) * PAGE_SIZE;
		const url =
			`${this.baseUrl}/manga?limit=${PAGE_SIZE}&offset=${offset}` +
			`&includes[]=cover_art&order[followedCount]=desc`;

		const data = await this.fetchJson<MangaDexListResponse<MangaDexManga>>(url);
		return {
			manga: data.data.map(mangaToSourceManga),
			hasNextPage: offset + data.limit < data.total,
		};
	}

	async getLatestUpdates(page: number): Promise<MangaPage> {
		const offset = (page - 1) * PAGE_SIZE;
		const url =
			`${this.baseUrl}/manga?limit=${PAGE_SIZE}&offset=${offset}` +
			`&includes[]=cover_art&order[latestUploadedChapter]=desc`;

		const data = await this.fetchJson<MangaDexListResponse<MangaDexManga>>(url);
		return {
			manga: data.data.map(mangaToSourceManga),
			hasNextPage: offset + data.limit < data.total,
		};
	}

	async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
		const mangaId = mangaUrl.replace(/^\/manga\//, "");
		const url =
			`${this.baseUrl}/manga/${mangaId}` +
			`?includes[]=cover_art&includes[]=author&includes[]=artist`;

		const data = await this.fetchJson<{ data: MangaDexManga }>(url);
		const { attributes, relationships } = data.data;

		const genres = (attributes.tags ?? [])
			.map((tag) => tag.attributes?.name?.en)
			.filter((name): name is string => name !== undefined);

		return {
			title: extractTitle(attributes.title),
			author: extractPersonName(relationships, "author"),
			artist: extractPersonName(relationships, "artist"),
			description: attributes.description?.en,
			genres: genres.length > 0 ? genres : undefined,
			status: mapStatus(attributes.status),
			type: mapType(attributes.originalLanguage),
			thumbnailUrl: extractCoverUrl(data.data.id, relationships),
		};
	}

	async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
		const mangaId = mangaUrl.replace(/^\/manga\//, "");
		const chapters: SourceChapter[] = [];
		const seenChapterNumbers = new Set<number>();
		let offset = 0;
		let total = Number.POSITIVE_INFINITY;

		while (offset < total) {
			const url =
				`${this.baseUrl}/manga/${mangaId}/feed` +
				`?translatedLanguage[]=en&order[chapter]=asc` +
				`&limit=${CHAPTER_PAGE_SIZE}&offset=${offset}` +
				`&includes[]=scanlation_group`;

			const data =
				await this.fetchJson<MangaDexListResponse<MangaDexChapter>>(url);

			total = data.total;

			for (const ch of data.data) {
				const { attributes, relationships } = ch;

				// Skip chapters with external URLs (they can't be read in-app)
				if (attributes.externalUrl) {
					continue;
				}

				const chapterNum = attributes.chapter
					? Number.parseFloat(attributes.chapter)
					: undefined;

				// Deduplicate by chapter number — keep the first occurrence
				if (chapterNum !== undefined && !Number.isNaN(chapterNum)) {
					if (seenChapterNumbers.has(chapterNum)) {
						continue;
					}
					seenChapterNumbers.add(chapterNum);
				}

				const volumeNum = attributes.volume
					? Number.parseFloat(attributes.volume)
					: undefined;

				const scanlator = extractPersonName(relationships, "scanlation_group");

				const name = attributes.title
					? `Chapter ${attributes.chapter ?? "?"}: ${attributes.title}`
					: `Chapter ${attributes.chapter ?? "?"}`;

				chapters.push({
					url: `/chapter/${ch.id}`,
					name,
					chapterNumber:
						chapterNum !== undefined && !Number.isNaN(chapterNum)
							? chapterNum
							: undefined,
					volumeNumber:
						volumeNum !== undefined && !Number.isNaN(volumeNum)
							? volumeNum
							: undefined,
					scanlator,
					dateUpload: new Date(attributes.publishAt),
				});
			}

			offset += CHAPTER_PAGE_SIZE;
		}

		return chapters;
	}

	async getPageList(chapterUrl: string): Promise<PageUrl[]> {
		const chapterId = chapterUrl.replace(/^\/chapter\//, "");
		const url = `${this.baseUrl}/at-home/server/${chapterId}`;

		// Use a unique cache key with timestamp to prevent caching
		// (at-home URLs expire in ~15 minutes)
		const cacheKey = `at-home:${chapterId}:${Date.now()}`;
		const data = await this.fetchJson<MangaDexAtHomeResponse>(url, cacheKey);

		const { baseUrl, chapter } = data;
		return chapter.data.map(
			(filename) => `${baseUrl}/data/${chapter.hash}/${filename}`,
		);
	}
}

registerSource({
	id: "mangadex",
	name: "MangaDex",
	lang: "all",
	group: "api",
	factory: () => new MangaDexSource(),
});
