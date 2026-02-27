// ---------------------------------------------------------------------------
// Hardcover API response types for import operations
// ---------------------------------------------------------------------------

/** Raw author from the Hardcover GraphQL API */
export type HardcoverRawAuthor = {
  id: number;
  name: string;
  slug: string | undefined;
  bio: string | undefined;
  bornYear: number | undefined;
  deathYear: number | undefined;
  imageUrl: string | undefined;
};

/** Raw book from the Hardcover "author complete" query */
export type HardcoverRawBook = {
  id: number;
  title: string;
  slug: string | undefined;
  description: string | undefined;
  releaseDate: string | undefined;
  releaseYear: number | undefined;
  rating: number | undefined;
  ratingsCount: number | undefined;
  usersCount: number | undefined;
  coverUrl: string | undefined;
  isCompilation: boolean;
  contributions: HardcoverRawContribution[];
  series: HardcoverRawBookSeries[];
};

/** Raw contribution entry from a book's contributions array */
export type HardcoverRawContribution = {
  authorId: number;
  authorName: string;
  authorSlug: string | undefined;
  authorImageUrl: string | undefined;
  contribution: string | undefined; // undefined = primary author
  position: number;
};

/** Raw book-series link */
export type HardcoverRawBookSeries = {
  seriesId: number;
  seriesTitle: string;
  seriesSlug: string | undefined;
  isCompleted: boolean | undefined;
  position: string | undefined;
};

/** Raw edition from the batched editions query */
export type HardcoverRawEdition = {
  id: number;
  bookId: number;
  title: string;
  isbn10: string | undefined;
  isbn13: string | undefined;
  asin: string | undefined;
  format: string | undefined;
  pageCount: number | undefined;
  publisher: string | undefined;
  editionInformation: string | undefined;
  releaseDate: string | undefined;
  language: string | undefined;
  languageCode: string | undefined;
  country: string | undefined;
  usersCount: number;
  score: number;
  coverUrl: string | undefined;
  contributors: Array<{
    authorId: string;
    name: string;
    contribution: string | undefined;
  }>;
};

/** Raw series from the "series complete" query */
export type HardcoverRawSeries = {
  id: number;
  title: string;
  slug: string | undefined;
  isCompleted: boolean | undefined;
  books: HardcoverRawSeriesBook[];
};

/** Raw book entry within a series result */
export type HardcoverRawSeriesBook = {
  bookId: number;
  bookTitle: string;
  bookSlug: string | undefined;
  position: string | undefined;
  isCompilation: boolean;
  releaseDate: string | undefined;
  releaseYear: number | undefined;
  rating: number | undefined;
  usersCount: number | undefined;
  coverUrl: string | undefined;
  authorId: number | undefined;
  authorName: string | undefined;
  authorSlug: string | undefined;
  authorImageUrl: string | undefined;
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
