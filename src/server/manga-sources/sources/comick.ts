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

// --- Comick API response types ---

type ComickCover = {
	b2key: string;
	w: number;
	h: number;
};

type ComickSearchResult = {
	hid: string;
	slug: string;
	title: string;
	md_covers?: ComickCover[];
	content_rating?: string;
};

type ComickGenre = {
	name: string;
	slug: string;
};

type ComickComic = {
	hid: string;
	slug: string;
	title: string;
	desc?: string;
	status?: number;
	country?: string;
	md_covers?: ComickCover[];
	genres?: ComickGenre[];
	authors?: Array<{ name: string; role?: string }>;
	artists?: Array<{ name: string }>;
	last_chapter?: number;
};

type ComickChapter = {
	hid: string;
	chap: string | null;
	vol: string | null;
	title: string | null;
	group_name: string[] | null;
	created_at: string;
};

type ComickChapterDetail = {
	chapter: {
		md_images: Array<{ b2key: string; w: number; h: number }>;
	};
};

// --- Constants ---

const COMICK_BASE = "https://api.comick.fun";
const COVERS_BASE = "https://meo.comick.pictures";
const PAGE_SIZE = 20;
const CHAPTER_PAGE_SIZE = 300;

// --- Helper functions ---

function extractCoverUrl(covers?: ComickCover[]): string | undefined {
	if (!covers || covers.length === 0) {
		return undefined;
	}
	return `${COVERS_BASE}/${covers[0].b2key}`;
}

function mapStatus(status?: number): MangaDetails["status"] | undefined {
	switch (status) {
		case 1: {
			return "ongoing";
		}
		case 2: {
			return "complete";
		}
		case 3: {
			return "cancelled";
		}
		case 4: {
			return "hiatus";
		}
		default: {
			return undefined;
		}
	}
}

function mapType(country?: string): MangaDetails["type"] | undefined {
	switch (country) {
		case "kr": {
			return "manhwa";
		}
		case "cn": {
			return "manhua";
		}
		case "jp": {
			return "manga";
		}
		default: {
			return "manga";
		}
	}
}

function searchResultToSourceManga(result: ComickSearchResult): SourceManga {
	return {
		url: `/comic/${result.slug}`,
		title: result.title,
		thumbnailUrl: extractCoverUrl(result.md_covers),
	};
}

// --- Comick source ---

class ComickSource extends ApiEngine {
	constructor() {
		super({
			id: "comick",
			name: "Comick",
			baseUrl: COMICK_BASE,
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
		const url =
			`${this.baseUrl}/v1.0/search?q=${encodeURIComponent(query)}` +
			`&limit=${PAGE_SIZE}&page=${page}`;

		const data = await this.fetchJson<ComickSearchResult[]>(url);
		return {
			manga: data.map(searchResultToSourceManga),
			hasNextPage: data.length >= PAGE_SIZE,
		};
	}

	async getPopularManga(page: number): Promise<MangaPage> {
		const url =
			`${this.baseUrl}/v1.0/search?sort=follow` +
			`&limit=${PAGE_SIZE}&page=${page}`;

		const data = await this.fetchJson<ComickSearchResult[]>(url);
		return {
			manga: data.map(searchResultToSourceManga),
			hasNextPage: data.length >= PAGE_SIZE,
		};
	}

	async getLatestUpdates(page: number): Promise<MangaPage> {
		const url =
			`${this.baseUrl}/v1.0/search?sort=uploaded` +
			`&limit=${PAGE_SIZE}&page=${page}`;

		const data = await this.fetchJson<ComickSearchResult[]>(url);
		return {
			manga: data.map(searchResultToSourceManga),
			hasNextPage: data.length >= PAGE_SIZE,
		};
	}

	async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
		const slug = mangaUrl.replace(/^\/comic\//, "");
		const url = `${this.baseUrl}/comic/${slug}`;

		const data = await this.fetchJson<{ comic: ComickComic }>(url);
		const comic = data.comic;

		const genres = (comic.genres ?? []).map((g) => g.name);
		const author =
			comic.authors?.find((a) => a.role === "Author" || a.role === "Story")
				?.name ?? comic.authors?.[0]?.name;
		const artist = comic.artists?.[0]?.name;

		return {
			title: comic.title,
			author,
			artist,
			description: comic.desc,
			genres: genres.length > 0 ? genres : undefined,
			status: mapStatus(comic.status),
			type: mapType(comic.country),
			thumbnailUrl: extractCoverUrl(comic.md_covers),
		};
	}

	async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
		const slug = mangaUrl.replace(/^\/comic\//, "");

		// First get the comic's hid from the detail endpoint
		const comicData = await this.fetchJson<{ comic: ComickComic }>(
			`${this.baseUrl}/comic/${slug}`,
		);
		const hid = comicData.comic.hid;

		const chapters: SourceChapter[] = [];
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const url =
				`${this.baseUrl}/comic/${hid}/chapters` +
				`?lang=en&limit=${CHAPTER_PAGE_SIZE}&page=${page}`;

			const data = await this.fetchJson<{ chapters: ComickChapter[] }>(url);

			for (const ch of data.chapters) {
				const chapterNum = ch.chap ? Number.parseFloat(ch.chap) : undefined;
				const volumeNum = ch.vol ? Number.parseFloat(ch.vol) : undefined;

				const scanlator = ch.group_name?.join(", ") || undefined;

				const name = ch.title
					? `Chapter ${ch.chap ?? "?"}: ${ch.title}`
					: `Chapter ${ch.chap ?? "?"}`;

				chapters.push({
					url: `/chapter/${ch.hid}`,
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
					dateUpload: new Date(ch.created_at),
				});
			}

			hasMore = data.chapters.length >= CHAPTER_PAGE_SIZE;
			page += 1;
		}

		return chapters;
	}

	async getPageList(chapterUrl: string): Promise<PageUrl[]> {
		const hid = chapterUrl.replace(/^\/chapter\//, "");
		const url = `${this.baseUrl}/chapter/${hid}`;

		const data = await this.fetchJson<ComickChapterDetail>(url);
		return data.chapter.md_images.map((img) => `${COVERS_BASE}/${img.b2key}`);
	}
}

registerSource({
	id: "comick",
	name: "Comick",
	lang: "all",
	group: "api",
	factory: () => new ComickSource(),
});
