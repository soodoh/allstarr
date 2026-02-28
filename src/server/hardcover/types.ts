// ---------------------------------------------------------------------------
// Hardcover API response types for import operations
// ---------------------------------------------------------------------------

/** Raw author from the Hardcover GraphQL API */
export type HardcoverRawAuthor = {
  id: number;
  name: string;
  slug: string | null;
  bio: string | null;
  bornYear: number | null;
  deathYear: number | null;
  imageUrl: string | null;
};

/** Raw book from the Hardcover "author complete" query */
export type HardcoverRawBook = {
  id: number;
  title: string;
  slug: string | null;
  description: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  coverUrl: string | null;
  isCompilation: boolean;
  defaultCoverEditionId: number | null;
  contributions: HardcoverRawContribution[];
  series: HardcoverRawBookSeries[];
};

/** Raw contribution entry from a book's contributions array */
export type HardcoverRawContribution = {
  authorId: number;
  authorName: string;
  authorSlug: string | null;
  authorImageUrl: string | null;
  contribution: string | null; // null = primary author
  position: number;
};

/** Raw book-series link */
export type HardcoverRawBookSeries = {
  seriesId: number;
  seriesTitle: string;
  seriesSlug: string | null;
  isCompleted: boolean | null;
  position: string | null;
};

/** Raw edition from the batched editions query */
export type HardcoverRawEdition = {
  id: number;
  bookId: number;
  title: string;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  format: string | null;
  pageCount: number | null;
  publisher: string | null;
  editionInformation: string | null;
  releaseDate: string | null;
  language: string | null;
  languageCode: string | null;
  country: string | null;
  usersCount: number;
  score: number;
  coverUrl: string | null;
  contributors: Array<{
    authorId: string;
    name: string;
    contribution: string | null;
  }>;
};

/** Raw series from the "series complete" query */
export type HardcoverRawSeries = {
  id: number;
  title: string;
  slug: string | null;
  isCompleted: boolean | null;
  books: HardcoverRawSeriesBook[];
};

/** Raw book entry within a series result */
export type HardcoverRawSeriesBook = {
  bookId: number;
  bookTitle: string;
  bookSlug: string | null;
  position: string | null;
  isCompilation: boolean;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  usersCount: number | null;
  coverUrl: string | null;
  authorId: number | null;
  authorName: string | null;
  authorSlug: string | null;
  authorImageUrl: string | null;
};

// ---------------------------------------------------------------------------
// GraphQL response envelope types
// ---------------------------------------------------------------------------

export type GraphQLResponse<T = Record<string, unknown>> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

// ---------------------------------------------------------------------------
// Aggregate import result types
// ---------------------------------------------------------------------------

/** Full author import data collected from all queries */
export type AuthorImportData = {
  author: HardcoverRawAuthor;
  books: HardcoverRawBook[];
  seriesList: HardcoverRawSeries[];
  editions: Map<number, HardcoverRawEdition[]>; // bookId → editions
};

/** Result returned by import operations */
export type ImportResult = {
  authorId: number;
  booksAdded: number;
  editionsAdded: number;
};

/** Result returned by single book import */
export type BookImportResult = {
  bookId: number;
  authorId: number;
};

/** Result returned by metadata refresh */
export type RefreshResult = {
  booksUpdated: number;
  booksAdded: number;
  editionsUpdated: number;
  editionsAdded: number;
};
