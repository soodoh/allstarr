import type { IncomingMessage } from "node:http";
import { createFakeServer } from "./base";
import type { FakeServer, HandlerResult } from "./base";

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
};

function defaultState(): State {
  return {
    authors: [],
    books: [],
    editions: [],
    searchResults: [],
  };
}

function json(data: unknown): HandlerResult {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function handleSearch(state: State): HandlerResult {
  const results = state.searchResults.map((r) => ({
    hit: {
      id: r.id,
      slug: r.slug,
      title: r.title,
      _type: r.type,
      readers: r.readers || 0,
      cover_url: r.coverUrl || "",
    },
  }));
  return json({ data: { search: results } });
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
  // Parse batch aliases like "b123: editions(where: {book_id: {_eq: 123}})"
  const aliasPattern =
    /(\w+):\s*editions\(where:\s*\{book_id:\s*\{_eq:\s*(\d+)\}\}\)/g;
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
  const seriesId = variables.seriesId as number | undefined;

  // Find books with matching series
  const seriesBooks = state.books.filter((b) =>
    b.book_series.some((bs) => !seriesId || bs.series.id === seriesId),
  );

  const seriesData =
    seriesBooks.length > 0
      ? seriesBooks[0].book_series
          .filter((bs) => !seriesId || bs.series.id === seriesId)
          .map((bs) => {
            const matchingBooks = seriesBooks
              .filter((sb) =>
                sb.book_series.some((sbs) => sbs.series.id === bs.series.id),
              )
              .map((sb) => ({
                position: sb.book_series.find(
                  (sbs) => sbs.series.id === bs.series.id,
                )?.position,
                book: sb,
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

  // Dispatch based on query content
  if (query.includes("search(") || query.includes("Search")) {
    return handleSearch(state);
  }

  if (query.includes("AuthorComplete") || query.includes("authors(where")) {
    return handleAuthorQuery(state, vars);
  }

  if (query.includes("editions(where")) {
    return handleEditionsQuery(state, query);
  }

  if (query.includes("series(where")) {
    return handleSeriesQuery(state, vars);
  }

  // Fallback: empty data
  return json({ data: {} });
}

export default function createHardcoverServer(port: number): FakeServer<State> {
  return createFakeServer<State>({ port, defaultState, handler });
}
