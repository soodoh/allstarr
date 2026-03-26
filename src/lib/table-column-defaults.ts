export type TableColumnDef = {
  /** Unique key identifying this column within the table */
  key: string;
  /** Display label shown in the settings popover and table header */
  label: string;
  /** If true, the column cannot be hidden (always visible) */
  locked?: boolean;
  /** Whether this column is visible by default (ignored if locked) */
  defaultVisible?: boolean;
};

export const TABLE_IDS = [
  "authors",
  "author-books",
  "author-series",
  "books",
  "book-editions",
  "tv",
  "movies",
] as const;

export type TableId = (typeof TABLE_IDS)[number];

export const TABLE_DEFAULTS: Record<TableId, TableColumnDef[]> = {
  authors: [
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "name", label: "Name", locked: true, defaultVisible: true },
    { key: "bookCount", label: "Books", defaultVisible: true },
    { key: "totalReaders", label: "Readers", defaultVisible: true },
  ],

  "author-books": [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "series", label: "Series", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "rating", label: "Rating", defaultVisible: true },
    { key: "format", label: "Type", defaultVisible: true },
    { key: "pages", label: "Pages", defaultVisible: true },
    { key: "isbn10", label: "ISBN 10", defaultVisible: false },
    { key: "isbn13", label: "ISBN-13", defaultVisible: false },
    { key: "asin", label: "ASIN", defaultVisible: false },
    { key: "score", label: "Data Score", defaultVisible: false },
    { key: "author", label: "Author", defaultVisible: false },
  ],

  "author-series": [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "position", label: "#", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "rating", label: "Rating", defaultVisible: true },
    { key: "format", label: "Type", defaultVisible: true },
    { key: "pages", label: "Pages", defaultVisible: true },
    { key: "isbn10", label: "ISBN 10", defaultVisible: false },
    { key: "isbn13", label: "ISBN-13", defaultVisible: false },
    { key: "asin", label: "ASIN", defaultVisible: false },
    { key: "score", label: "Data Score", defaultVisible: false },
    { key: "author", label: "Author", defaultVisible: false },
  ],

  books: [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "author", label: "Author", defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "series", label: "Series", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "rating", label: "Rating", defaultVisible: true },
  ],

  "book-editions": [
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "publisher", label: "Publisher", defaultVisible: true },
    { key: "format", label: "Type", defaultVisible: true },
    { key: "pages", label: "Pages", defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "language", label: "Language", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "score", label: "Data Score", defaultVisible: true },
    { key: "information", label: "Information", defaultVisible: false },
    { key: "isbn13", label: "ISBN-13", defaultVisible: false },
    { key: "isbn10", label: "ISBN 10", defaultVisible: false },
    { key: "asin", label: "ASIN", defaultVisible: false },
    { key: "country", label: "Country", defaultVisible: false },
  ],

  tv: [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "year", label: "Year", defaultVisible: true },
    { key: "network", label: "Network", defaultVisible: true },
    { key: "seasons", label: "Seasons", defaultVisible: true },
    { key: "episodes", label: "Episodes", defaultVisible: true },
    { key: "status", label: "Status", defaultVisible: true },
  ],

  movies: [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "year", label: "Year", defaultVisible: true },
    { key: "studio", label: "Studio", defaultVisible: true },
    { key: "status", label: "Status", defaultVisible: true },
  ],
};

/** Returns the default column order (all column keys) for a table */
export function getDefaultColumnOrder(tableId: TableId): string[] {
  return TABLE_DEFAULTS[tableId].map((c) => c.key);
}

/** Returns the default hidden columns for a table */
export function getDefaultHiddenColumns(tableId: TableId): string[] {
  return TABLE_DEFAULTS[tableId]
    .filter((c) => !c.locked && !c.defaultVisible)
    .map((c) => c.key);
}
