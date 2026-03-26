// ---------------------------------------------------------------------------
// Optimized GraphQL queries for Hardcover import operations
// ---------------------------------------------------------------------------

import type {
  HardcoverRawAuthor,
  HardcoverRawBook,
  HardcoverRawContribution,
  HardcoverRawBookSeries,
  HardcoverRawEdition,
  HardcoverRawSeries,
  HardcoverRawSeriesBook,
  HardcoverRawSeriesBookEdition,
} from "./types";
import { AUTHOR_ROLE_FILTER } from "./constants";
import { hardcoverFetch } from "./client";

const EDITIONS_BATCH_SIZE = 50;
const BATCH_DELAY_MS = 500;
const EDITIONS_CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Shared GraphQL helpers (duplicated from search.ts to avoid coupling)
// ---------------------------------------------------------------------------

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => toRecord(entry)).filter(Boolean) as Array<
    Record<string, unknown>
  >;
}

function firstString(
  record: Record<string, unknown>,
  paths: string[][],
): string | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      const next = toRecord(current);
      if (!next || !(key in next)) {
        current = undefined;
        break;
      }
      current = next[key];
    }
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function firstNumber(
  record: Record<string, unknown>,
  paths: string[][],
): number | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      const next = toRecord(current);
      if (!next || !(key in next)) {
        current = undefined;
        break;
      }
      current = next[key];
    }
    if (typeof current === "number" && Number.isFinite(current)) {
      return current;
    }
    if (typeof current === "string") {
      const parsed = Number(current);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function getCoverUrl(record: Record<string, unknown>): string | undefined {
  const imageRecord = toRecord(record.image);
  if (imageRecord) {
    const imageUrl = firstString(imageRecord, [["url"], ["large"], ["medium"]]);
    if (imageUrl) {
      return imageUrl;
    }
  }
  return undefined;
}

const FORMAT_DISPLAY_NAMES: Record<string, string> = {
  Read: "Physical Book",
  Listened: "Audiobook",
  Ebook: "E-Book",
};

function mapEditionFormat(raw: string | null): string | null {
  return raw ? (FORMAT_DISPLAY_NAMES[raw] ?? raw) : null;
}

// ---------------------------------------------------------------------------
// Query 1: Author Complete — author meta + ALL books in one call
// ---------------------------------------------------------------------------

const AUTHOR_COMPLETE_QUERY = `
query AuthorComplete($authorId: Int!, $limit: Int!, $offset: Int!) {
  authors(where: { id: { _eq: $authorId } }, limit: 1) {
    id
    name
    slug
    bio
    born_year
    death_year
    image { url }
  }
  books(
    where: {
      contributions: {
        author_id: { _eq: $authorId }
        ${AUTHOR_ROLE_FILTER}
      }
    }
    limit: $limit
    offset: $offset
    order_by: [{ release_year: desc_nulls_last }, { id: desc }]
  ) {
    id
    title
    slug
    description
    release_date
    release_year
    rating
    ratings_count
    users_count
    compilation
    canonical_id
    default_cover_edition_id
    image { url }
    contributions(order_by: [{ id: asc }], limit: 50) {
      contribution
      author {
        id
        name
        slug
        image { url }
      }
    }
    book_series {
      position
      series {
        id
        name
        slug
        is_completed
      }
    }
  }
  books_aggregate(
    where: {
      contributions: {
        author_id: { _eq: $authorId }
        ${AUTHOR_ROLE_FILTER}
      }
    }
  ) {
    aggregate { count }
  }
}
`;

function parseRawBook(
  bookRecord: Record<string, unknown>,
): HardcoverRawBook | undefined {
  const id = firstNumber(bookRecord, [["id"]]);
  const title = firstString(bookRecord, [["title"]]);
  if (!id || !title) {
    return undefined;
  }

  const contributions: HardcoverRawContribution[] = toRecordArray(
    bookRecord.contributions,
  ).map((c, i) => {
    const authorRecord = toRecord(c.author);
    return {
      authorId: authorRecord ? (firstNumber(authorRecord, [["id"]]) ?? 0) : 0,
      authorName: authorRecord
        ? (firstString(authorRecord, [["name"]]) ?? "")
        : "",
      authorSlug: authorRecord
        ? (firstString(authorRecord, [["slug"]]) ?? null)
        : null,
      authorImageUrl: authorRecord ? (getCoverUrl(authorRecord) ?? null) : null,
      contribution: typeof c.contribution === "string" ? c.contribution : null,
      position: i,
    };
  });

  const bookSeriesEntries = toRecordArray(bookRecord.book_series);
  const series: HardcoverRawBookSeries[] = bookSeriesEntries
    .map((entry) => {
      const seriesRecord = toRecord(entry.series);
      if (!seriesRecord) {
        return undefined;
      }
      const seriesId = firstNumber(seriesRecord, [["id"]]);
      const seriesTitle = firstString(seriesRecord, [["name"], ["title"]]);
      if (!seriesId || !seriesTitle) {
        return undefined;
      }
      return {
        seriesId,
        seriesTitle,
        seriesSlug: firstString(seriesRecord, [["slug"]]) ?? null,
        isCompleted:
          typeof seriesRecord.is_completed === "boolean"
            ? seriesRecord.is_completed
            : null,
        position:
          firstNumber(entry, [["position"]])?.toString() ??
          firstString(entry, [["position"]]) ??
          null,
      };
    })
    .filter(Boolean) as HardcoverRawBookSeries[];

  return {
    id,
    title,
    slug: firstString(bookRecord, [["slug"]]) ?? null,
    description: firstString(bookRecord, [["description"]]) ?? null,
    releaseDate: firstString(bookRecord, [["release_date"]]) ?? null,
    releaseYear: firstNumber(bookRecord, [["release_year"]]) ?? null,
    rating: firstNumber(bookRecord, [["rating"]]) ?? null,
    ratingsCount: firstNumber(bookRecord, [["ratings_count"]]) ?? null,
    usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
    coverUrl: getCoverUrl(bookRecord) ?? null,
    isCompilation: bookRecord.compilation === true,
    canonicalId: firstNumber(bookRecord, [["canonical_id"]]) ?? null,
    defaultCoverEditionId:
      firstNumber(bookRecord, [["default_cover_edition_id"]]) ?? null,
    contributions,
    series,
  };
}

export async function fetchAuthorComplete(
  authorId: number,
): Promise<{ author: HardcoverRawAuthor; books: HardcoverRawBook[] }> {
  const BATCH_SIZE = 500;
  let offset = 0;
  const allBooks: HardcoverRawBook[] = [];
  // oxlint-disable-next-line prefer-const -- assigned after API call
  let author: HardcoverRawAuthor | undefined;
  let totalBooks = 0;

  // First page — also fetches author meta
  const firstPage = await hardcoverFetch<{
    authors: unknown;
    books: unknown;
    books_aggregate: unknown;
  }>(AUTHOR_COMPLETE_QUERY, { authorId, limit: BATCH_SIZE, offset: 0 });

  const authors = toRecordArray(firstPage.authors);
  const authorRecord = authors[0];
  if (!authorRecord) {
    throw new Error("Author not found on Hardcover.");
  }

  author = {
    id: firstNumber(authorRecord, [["id"]]) ?? authorId,
    name: firstString(authorRecord, [["name"]]) ?? "",
    slug: firstString(authorRecord, [["slug"]]) ?? null,
    bio: firstString(authorRecord, [["bio"]]) ?? null,
    bornYear: firstNumber(authorRecord, [["born_year"]]) ?? null,
    deathYear: firstNumber(authorRecord, [["death_year"]]) ?? null,
    imageUrl: getCoverUrl(authorRecord) ?? null,
  };

  const aggRecord = toRecord(firstPage.books_aggregate);
  const aggInner = aggRecord ? toRecord(aggRecord.aggregate) : undefined;
  totalBooks = aggInner ? (firstNumber(aggInner, [["count"]]) ?? 0) : 0;

  const firstPageBooks = toRecordArray(firstPage.books)
    .map(parseRawBook)
    .filter(Boolean) as HardcoverRawBook[];
  allBooks.push(...firstPageBooks);
  offset += BATCH_SIZE;

  // Paginate remaining books
  while (offset < totalBooks) {
    const page = await hardcoverFetch<{ books: unknown }>(
      AUTHOR_COMPLETE_QUERY,
      { authorId, limit: BATCH_SIZE, offset },
    );
    const pageBooks = toRecordArray(page.books)
      .map(parseRawBook)
      .filter(Boolean) as HardcoverRawBook[];
    allBooks.push(...pageBooks);
    offset += BATCH_SIZE;
    if (pageBooks.length < BATCH_SIZE) {
      break;
    }
  }

  return { author, books: allBooks };
}

// ---------------------------------------------------------------------------
// Query 2: Series Complete — all series + their books in one call
// ---------------------------------------------------------------------------

const SERIES_COMPLETE_QUERY = `
query SeriesComplete($seriesIds: [Int!]!, $langCodes: [String!]!, $excludeAuthorId: Int!) {
  series(where: { id: { _in: $seriesIds } }) {
    id
    name
    slug
    is_completed
    book_series(
      where: {
        compilation: { _neq: true }
        book: {
          canonical_id: { _is_null: true }
          editions: { language: { code2: { _in: $langCodes } } }
          _not: { contributions: { author_id: { _eq: $excludeAuthorId } } }
        }
      }
      order_by: [{ position: asc_nulls_last }, { book: { users_count: desc } }]
    ) {
      position
      compilation
      book {
        id
        title
        slug
        release_date
        release_year
        rating
        users_count
        default_cover_edition_id
        image { url }
        contributions(
          where: { ${AUTHOR_ROLE_FILTER} }
          order_by: [{ id: asc }]
          limit: 1
        ) {
          author {
            id
            name
            slug
            image { url }
          }
        }
        editions(
          where: { language: { code2: { _in: $langCodes } } }
          order_by: [{ users_count: desc_nulls_last }]
          limit: 10
        ) {
          id
          title
          isbn_10
          isbn_13
          asin
          pages
          audio_seconds
          release_date
          score
          users_count
          image { url }
          language { code2 }
          reading_format { format }
        }
      }
    }
  }
}
`;

export async function fetchSeriesComplete(
  seriesIds: number[],
  langCodes: string[],
  excludeAuthorId: number,
): Promise<HardcoverRawSeries[]> {
  if (seriesIds.length === 0) {
    return [];
  }

  const data = await hardcoverFetch<{ series: unknown }>(
    SERIES_COMPLETE_QUERY,
    { seriesIds, langCodes, excludeAuthorId },
  );

  return toRecordArray(data.series)
    .map((s) => {
      const id = firstNumber(s, [["id"]]);
      const title = firstString(s, [["name"], ["title"]]);
      if (!id || !title) {
        return undefined;
      }

      const bookEntries = toRecordArray(s.book_series);

      // --- Pass 1: Parse all entries and deduplicate by position ---
      const seen = new Set<number>();
      const allBooks: HardcoverRawSeriesBook[] = bookEntries
        .map((entry) => {
          const position = firstNumber(entry, [["position"]]);
          if (position === undefined) {
            return undefined;
          }
          if (seen.has(position)) {
            return undefined;
          }
          seen.add(position);

          const bookRecord = toRecord(entry.book);
          if (!bookRecord) {
            return undefined;
          }
          const bookId = firstNumber(bookRecord, [["id"]]);
          const bookTitle = firstString(bookRecord, [["title"]]);
          if (!bookId || !bookTitle) {
            return undefined;
          }

          const contributions = toRecordArray(bookRecord.contributions);
          const primaryContribution =
            contributions.length > 0 ? contributions[0] : undefined;
          const primaryAuthor = primaryContribution
            ? toRecord(primaryContribution.author)
            : undefined;

          const defaultCoverEditionId =
            firstNumber(bookRecord, [["default_cover_edition_id"]]) ?? null;

          const editionRecords = toRecordArray(bookRecord.editions);
          const bookEditions: HardcoverRawSeriesBookEdition[] = editionRecords
            .map((edRec) => {
              const edId = firstNumber(edRec, [["id"]]);
              if (!edId) {
                return undefined;
              }
              const langRecord = toRecord(edRec.language);
              const formatRecord = toRecord(edRec.reading_format);
              return {
                id: edId,
                title: firstString(edRec, [["title"]]) ?? "",
                isbn10: firstString(edRec, [["isbn_10"]]) ?? null,
                isbn13: firstString(edRec, [["isbn_13"]]) ?? null,
                asin: firstString(edRec, [["asin"]]) ?? null,
                format: mapEditionFormat(
                  formatRecord
                    ? (firstString(formatRecord, [["format"]]) ?? null)
                    : null,
                ),
                pageCount: firstNumber(edRec, [["pages"]]) ?? null,
                audioLength: firstNumber(edRec, [["audio_seconds"]]) ?? null,
                releaseDate: firstString(edRec, [["release_date"]]) ?? null,
                usersCount: firstNumber(edRec, [["users_count"]]) ?? 0,
                score: firstNumber(edRec, [["score"]]) ?? 0,
                languageCode: langRecord
                  ? (firstString(langRecord, [["code2"]]) ?? null)
                  : null,
                coverUrl: getCoverUrl(edRec) ?? null,
                isDefaultCover: edId === defaultCoverEditionId,
              } satisfies HardcoverRawSeriesBookEdition;
            })
            .filter(Boolean) as HardcoverRawSeriesBookEdition[];

          return {
            bookId,
            bookTitle,
            bookSlug: firstString(bookRecord, [["slug"]]) ?? null,
            position: position.toString(),
            isCompilation: entry.compilation === true,
            releaseDate: firstString(bookRecord, [["release_date"]]) ?? null,
            releaseYear: firstNumber(bookRecord, [["release_year"]]) ?? null,
            rating: firstNumber(bookRecord, [["rating"]]) ?? null,
            usersCount: firstNumber(bookRecord, [["users_count"]]) ?? null,
            coverUrl: getCoverUrl(bookRecord) ?? null,
            authorId: primaryAuthor
              ? (firstNumber(primaryAuthor, [["id"]]) ?? null)
              : null,
            authorName: primaryAuthor
              ? (firstString(primaryAuthor, [["name"]]) ?? null)
              : null,
            authorSlug: primaryAuthor
              ? (firstString(primaryAuthor, [["slug"]]) ?? null)
              : null,
            authorImageUrl: primaryAuthor
              ? (getCoverUrl(primaryAuthor) ?? null)
              : null,
            defaultCoverEditionId,
            editions: bookEditions,
          };
        })
        .filter(Boolean) as HardcoverRawSeriesBook[];

      // --- Pass 2: Filter partial editions ---
      // Build a map of integer-position book titles for comparison.
      const integerPositionTitles = new Map<number, string>();
      for (const book of allBooks) {
        const pos = Number(book.position);
        if (Number.isInteger(pos)) {
          integerPositionTitles.set(pos, book.bookTitle);
        }
      }

      // Filter out books at fractional positions whose title starts with
      // the title of the book at the corresponding integer position
      // (e.g., "The Fires of Heaven, Part 2" at 5.2 starts with
      // "The Fires of Heaven" at 5 → partial edition → exclude).
      const books = allBooks.filter((book) => {
        const pos = Number(book.position);
        if (Number.isInteger(pos)) {
          return true; // Keep all integer-position books
        }
        const intPos = Math.floor(pos);
        const parentTitle = integerPositionTitles.get(intPos);
        if (!parentTitle) {
          return true; // No parent book at integer position → keep
        }
        // If this book's title starts with the parent's title, it's a partial
        return !book.bookTitle
          .toLowerCase()
          .startsWith(parentTitle.toLowerCase());
      });

      return {
        id,
        title,
        slug: firstString(s, [["slug"]]) ?? null,
        isCompleted:
          typeof s.is_completed === "boolean" ? s.is_completed : null,
        books,
      };
    })
    .filter(Boolean) as HardcoverRawSeries[];
}

// ---------------------------------------------------------------------------
// Query 3: Batched Book Editions — uses alias pattern
// ---------------------------------------------------------------------------

function buildBatchedEditionsQuery(bookIds: number[]): string {
  const fragments = bookIds
    .map(
      (bookId, i) => `  b${i}: editions(
    where: { book_id: { _eq: ${bookId} } }
    order_by: [{ users_count: desc_nulls_last }]
  ) {
    id
    title
    isbn_10
    isbn_13
    asin
    pages
    audio_seconds
    release_date
    users_count
    score
    cached_contributors
    image { url }
    language { code2 language }
    country { name }
    publisher { name }
    reading_format { format }
    edition_information
  }`,
    )
    .join("\n");

  return `query BatchedEditions {\n${fragments}\n}`;
}

function parseEdition(
  record: Record<string, unknown>,
  bookId: number,
): HardcoverRawEdition | undefined {
  const id = firstNumber(record, [["id"]]);
  if (!id) {
    return undefined;
  }

  const publisherRecord = toRecord(record.publisher);
  const readingFormatRecord = toRecord(record.reading_format);
  const languageRecord = toRecord(record.language);
  const countryRecord = toRecord(record.country);

  const cachedContributors = Array.isArray(record.cached_contributors)
    ? record.cached_contributors
    : [];
  const contributors = cachedContributors
    .map((c: unknown) => {
      const cr = toRecord(c);
      if (!cr) {
        return undefined;
      }
      const authorRecord = toRecord(cr.author);
      return {
        authorId: String(
          authorRecord ? (firstNumber(authorRecord, [["id"]]) ?? "") : "",
        ),
        name: authorRecord ? (firstString(authorRecord, [["name"]]) ?? "") : "",
        contribution:
          typeof cr.contribution === "string" ? cr.contribution : null,
      };
    })
    .filter(Boolean) as Array<{
    authorId: string;
    name: string;
    contribution: string | null;
  }>;

  return {
    id,
    bookId,
    title: firstString(record, [["title"]]) ?? "",
    isbn10: firstString(record, [["isbn_10"]]) ?? null,
    isbn13: firstString(record, [["isbn_13"]]) ?? null,
    asin: firstString(record, [["asin"]]) ?? null,
    format: mapEditionFormat(
      readingFormatRecord
        ? (firstString(readingFormatRecord, [["format"]]) ?? null)
        : null,
    ),
    pageCount: firstNumber(record, [["pages"]]) ?? null,
    audioLength: firstNumber(record, [["audio_seconds"]]) ?? null,
    publisher: publisherRecord
      ? (firstString(publisherRecord, [["name"]]) ?? null)
      : null,
    editionInformation: firstString(record, [["edition_information"]]) ?? null,
    releaseDate: firstString(record, [["release_date"]]) ?? null,
    language: languageRecord
      ? (firstString(languageRecord, [["language"]]) ?? null)
      : null,
    languageCode: languageRecord
      ? (firstString(languageRecord, [["code2"]]) ?? null)
      : null,
    country: countryRecord
      ? (firstString(countryRecord, [["name"]]) ?? null)
      : null,
    usersCount: firstNumber(record, [["users_count"]]) ?? 0,
    score: firstNumber(record, [["score"]]) ?? 0,
    coverUrl: getCoverUrl(record) ?? null,
    contributors,
  };
}

export async function fetchBatchedEditions(
  bookIds: number[],
): Promise<Map<number, HardcoverRawEdition[]>> {
  const result = new Map<number, HardcoverRawEdition[]>();
  if (bookIds.length === 0) {
    return result;
  }

  // Split into batches
  const batches: number[][] = [];
  for (let i = 0; i < bookIds.length; i += EDITIONS_BATCH_SIZE) {
    batches.push(bookIds.slice(i, i + EDITIONS_BATCH_SIZE));
  }

  // Process in concurrent groups
  for (let g = 0; g < batches.length; g += EDITIONS_CONCURRENCY) {
    if (g > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, BATCH_DELAY_MS);
      });
    }

    const group = batches.slice(g, g + EDITIONS_CONCURRENCY);
    const results = await Promise.all(
      group.map(async (batch) => {
        const query = buildBatchedEditionsQuery(batch);
        const data = await hardcoverFetch<Record<string, unknown>>(query, {});
        return { batch, data };
      }),
    );

    for (const { batch, data } of results) {
      for (let j = 0; j < batch.length; j += 1) {
        const bookId = batch[j];
        const eds = toRecordArray(data[`b${j}`])
          .map((r) => parseEdition(r, bookId))
          .filter(Boolean) as HardcoverRawEdition[];
        result.set(bookId, eds);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Query 4: Book Complete — single book with editions + contributions
// ---------------------------------------------------------------------------

const BOOK_COMPLETE_QUERY = `
query BookComplete($bookId: Int!) {
  books(where: { id: { _eq: $bookId } }, limit: 1) {
    id
    title
    slug
    description
    release_date
    release_year
    rating
    ratings_count
    users_count
    default_cover_edition_id
    image { url }
    contributions(order_by: [{ id: asc }], limit: 50) {
      contribution
      author {
        id
        name
        slug
        image { url }
      }
    }
    book_series {
      position
      series {
        id
        name
        slug
        is_completed
      }
    }
  }
  editions(
    where: { book_id: { _eq: $bookId } }
    order_by: [{ users_count: desc_nulls_last }]
  ) {
    id
    title
    isbn_10
    isbn_13
    asin
    pages
    audio_seconds
    release_date
    users_count
    score
    cached_contributors
    image { url }
    language { code2 language }
    country { name }
    publisher { name }
    reading_format { format }
    edition_information
  }
}
`;

export async function fetchBookComplete(foreignBookId: number): Promise<
  | {
      book: HardcoverRawBook;
      editions: HardcoverRawEdition[];
    }
  | undefined
> {
  const data = await hardcoverFetch<{ books: unknown; editions: unknown }>(
    BOOK_COMPLETE_QUERY,
    { bookId: foreignBookId },
  );

  const booksArray = toRecordArray(data.books);
  if (booksArray.length === 0) {
    return undefined;
  }

  const book = parseRawBook(booksArray[0]);
  if (!book) {
    return undefined;
  }

  const editions = toRecordArray(data.editions)
    .map((r) => parseEdition(r, foreignBookId))
    .filter(Boolean) as HardcoverRawEdition[];

  return { book, editions };
}
