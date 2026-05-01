import type { IncomingMessage } from "node:http";
import type { FakeServer, HandlerResult } from "./base";
import { createFakeServer } from "./base";

type Author = {
	id: number;
	name: string;
	slug: string;
	bio: string;
	born_year: number | null;
	death_year: number | null;
	image: { url: string };
};

type Book = {
	id: number;
	title: string;
	slug: string;
	description: string;
	release_date: string | null;
	release_year: number | null;
	rating: number | null;
	ratings_count: number | null;
	users_count: number | null;
	compilation: boolean;
	default_cover_edition_id: number | null;
	image: { url: string };
	authorId: number;
	contributions: Array<{
		contribution: string | null;
		author: {
			id: number;
			name: string;
			slug: string;
			image: { url: string };
		};
	}>;
	book_series: Array<{
		position: string | null;
		series: { id: number; name: string; slug: string; is_completed: boolean };
	}>;
};

type Edition = {
	id: number;
	bookId: number;
	title: string;
	isbn_10: string | null;
	isbn_13: string | null;
	asin: string | null;
	pages: number | null;
	audio_seconds: number | null;
	release_date: string | null;
	users_count: number | null;
	score: number | null;
	image: { url: string };
	language: { code2: string; language: string } | null;
	reading_format: { format: string } | null;
	publisher: { name: string } | null;
};

type SearchResult = {
	id: number;
	type: "book" | "author";
	slug: string;
	title: string;
	readers?: number;
	coverUrl?: string;
};

type State = {
	authors: Author[];
	books: Book[];
	editions: Edition[];
	searchResults: SearchResult[];
	requestLog: Array<{ query: string; variables: Record<string, unknown> }>;
};

function defaultState(seed?: Partial<State>): State {
	const clonedSeed = seed ? structuredClone(seed) : undefined;
	return {
		authors: [],
		books: [],
		editions: [],
		searchResults: [],
		requestLog: [],
		...clonedSeed,
	};
}

function json(data: unknown): HandlerResult {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	};
}

function handleSearch(
	state: State,
	vars: Record<string, unknown>,
): HandlerResult {
	const queryType = (vars.queryType as string | undefined) || "";

	// Filter results by queryType when specified
	const filtered = queryType
		? state.searchResults.filter(
				(r) => r.type.toLowerCase() === queryType.toLowerCase(),
			)
		: state.searchResults;

	// Build documents in the format the app expects (Typesense-like hits)
	const hits = filtered.map((r) => ({
		document: {
			id: r.id,
			slug: r.slug,
			title: r.title,
			name: r.title,
			users_count: r.readers || 0,
			image: { url: r.coverUrl || "" },
			// Book-specific fields
			...(r.type === "book"
				? {
						release_year:
							state.books.find((b) => b.id === r.id)?.release_year ?? null,
						author_names: state.books
							.find((b) => b.id === r.id)
							?.contributions.map((c) => c.author.name) ?? ["Unknown Author"],
						compilation: false,
					}
				: {}),
			// Author-specific fields
			...(r.type === "author"
				? {
						books_count:
							state.books.filter((b) => b.authorId === r.id).length || 0,
					}
				: {}),
		},
	}));

	return json({
		data: {
			search: {
				error: null,
				results: { hits },
			},
		},
	});
}

function handleAuthorQuery(
	state: State,
	variables: Record<string, unknown>,
): HandlerResult {
	const authorId = variables.authorId as number | undefined;
	const authorSlug = variables.slug as string | undefined;

	let author: Author | undefined;
	if (authorId) {
		author = state.authors.find((a) => a.id === authorId);
	} else if (authorSlug) {
		author = state.authors.find((a) => a.slug === authorSlug);
	} else {
		author = state.authors[0];
	}

	if (!author) {
		return json({ data: { authors: [] } });
	}

	const authorBooks = state.books.filter((b) => b.authorId === author.id);

	return json({
		data: {
			authors: [author],
			books: authorBooks,
			books_aggregate: { aggregate: { count: authorBooks.length } },
		},
	});
}

function handleEditionsQuery(state: State, query: string): HandlerResult {
	// Match the aliased multiline query emitted by buildBatchedEditionsQuery().
	const aliasPattern =
		/(\w+):\s*editions\(\s*where:\s*\{\s*book_id:\s*\{\s*_eq:\s*(\d+)\s*\}\s*\}/gm;
	const result: Record<string, Edition[]> = {};

	let found = aliasPattern.exec(query);
	while (found !== null) {
		const alias = found[1];
		const bookId = Number.parseInt(found[2], 10);
		result[alias] = state.editions.filter((e) => e.bookId === bookId);
		found = aliasPattern.exec(query);
	}

	// If no aliases found, return all editions
	if (Object.keys(result).length === 0) {
		return json({ data: { editions: state.editions } });
	}

	return json({ data: result });
}

function handleSeriesQuery(
	state: State,
	variables: Record<string, unknown>,
): HandlerResult {
	const requestedSeriesIds = Array.isArray(variables.seriesIds)
		? variables.seriesIds
				.map((value) => (typeof value === "number" ? value : Number(value)))
				.filter((value) => Number.isFinite(value))
		: [];
	const requestedSeriesId = variables.seriesId as number | undefined;
	const matchesRequestedSeries = (seriesId: number): boolean =>
		requestedSeriesIds.length > 0
			? requestedSeriesIds.includes(seriesId)
			: !requestedSeriesId || seriesId === requestedSeriesId;

	// Find books with matching series
	const seriesBooks = state.books.filter((b) =>
		b.book_series.some((bs) => matchesRequestedSeries(bs.series.id)),
	);

	const seriesData =
		seriesBooks.length > 0
			? seriesBooks[0].book_series
					.filter((bs) => matchesRequestedSeries(bs.series.id))
					.map((bs) => {
						const matchingBooks = seriesBooks
							.filter((sb) =>
								sb.book_series.some((sbs) => sbs.series.id === bs.series.id),
							)
							.map((sb) => ({
								position: sb.book_series.find(
									(sbs) => sbs.series.id === bs.series.id,
								)?.position,
								compilation: sb.compilation,
								book: {
									...sb,
									editions: state.editions.filter(
										(edition) => edition.bookId === sb.id,
									),
								},
							}));
						return {
							id: bs.series.id,
							name: bs.series.name,
							slug: bs.series.slug,
							is_completed: bs.series.is_completed,
							book_series: matchingBooks,
						};
					})
			: [];

	return json({ data: { series: seriesData } });
}

function handler(
	req: IncomingMessage,
	body: string,
	state: State,
): HandlerResult {
	const url = new URL(req.url || "/", "http://localhost");

	if (url.pathname !== "/v1/graphql" || req.method !== "POST") {
		return null;
	}

	const parsed = JSON.parse(body) as {
		query: string;
		variables?: Record<string, unknown>;
	};
	const { query } = parsed;
	const vars = parsed.variables || {};

	state.requestLog.push({ query, variables: vars });

	// Dispatch based on query content
	if (query.includes("search(") || query.includes("Search")) {
		return handleSearch(state, vars);
	}

	if (query.includes("AuthorComplete") || query.includes("authors(where")) {
		return handleAuthorQuery(state, vars);
	}

	if (query.includes("SeriesComplete") || query.includes("series(where")) {
		return handleSeriesQuery(state, vars);
	}

	if (query.includes("query BatchedEditions") || query.includes("editions(")) {
		return handleEditionsQuery(state, query);
	}

	// Book filter queries (language, ISBN/ASIN, pages, popularity, contributors)
	// Return all book IDs as matching — fake server doesn't enforce filters
	if (query.includes("books(where")) {
		const ids = state.books.map((b) => ({ id: b.id }));
		return json({ data: { books: ids } });
	}

	// AuthorBookCounts query — return non-zero counts for each aliased aggregate
	if (query.includes("books_aggregate")) {
		const aliasPattern = /\ba(\d+):\s*books_aggregate/g;
		const result: Record<string, { aggregate: { count: number } }> = {};
		let found = aliasPattern.exec(query);
		while (found !== null) {
			result[`a${found[1]}`] = {
				aggregate: { count: state.books.length || 1 },
			};
			found = aliasPattern.exec(query);
		}
		return json({ data: result });
	}

	// Fallback: empty data
	return json({ data: {} });
}

export default function createHardcoverServer(
	port: number,
	seed?: Partial<State>,
): FakeServer<State> {
	return createFakeServer<State>({
		port,
		defaultState: () => defaultState(seed),
		handler,
	});
}
