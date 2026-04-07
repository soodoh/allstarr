import { eq, type InferSelectModel } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema";
import PORTS from "../ports";

type Db = BetterSQLite3Database<typeof schema>;

export function seedDownloadProfile(
  db: Db,
  overrides: Partial<typeof schema.downloadProfiles.$inferInsert> = {},
): InferSelectModel<typeof schema.downloadProfiles> {
  const rows = db
    .insert(schema.downloadProfiles)
    .values({
      name: "Default Profile",
      rootFolderPath: "/books",
      cutoff: 4,
      items: [[4], [5], [3], [2]],
      upgradeAllowed: false,
      icon: "book-open",
      categories: [],
      contentType: "ebook",
      language: "en",
      ...overrides,
    })
    .returning()
    .all();
  return rows[0];
}

export function seedAuthor(
  db: Db,
  overrides: Partial<typeof schema.authors.$inferInsert> = {},
): InferSelectModel<typeof schema.authors> {
  const rows = db
    .insert(schema.authors)
    .values({
      name: "Test Author",
      sortName: "Author, Test",
      slug: "test-author",
      bio: "A test author for e2e tests.",
      status: "continuing",
      foreignAuthorId: "hc-author-1",
      images: [{ url: "https://example.com/author.jpg", coverType: "poster" }],
      monitored: true,
      tags: [],
      ...overrides,
    })
    .returning()
    .all();
  return rows[0];
}

export function seedBook(
  db: Db,
  authorId: number,
  overrides: Partial<typeof schema.books.$inferInsert> = {},
): InferSelectModel<typeof schema.books> {
  const authorRow = db
    .select({
      name: schema.authors.name,
      foreignAuthorId: schema.authors.foreignAuthorId,
    })
    .from(schema.authors)
    .where(eq(schema.authors.id, authorId))
    .get();
  if (!authorRow) {
    throw new Error(`Author ${authorId} not found while seeding a book`);
  }

  const bookRows = db
    .insert(schema.books)
    .values({
      title: "Test Book",
      slug: "test-book",
      description: "A test book for e2e tests.",
      releaseYear: 2024,
      foreignBookId: "hc-book-1",
      images: [{ url: "https://example.com/book.jpg", coverType: "cover" }],
      tags: [],
      ...overrides,
    })
    .returning()
    .all();
  const book = bookRows[0];

  // Create the booksAuthors join row
  db.insert(schema.booksAuthors)
    .values({
      bookId: book.id,
      authorId,
      foreignAuthorId: authorRow.foreignAuthorId ?? `seed-author-${authorId}`,
      authorName: authorRow.name ?? `Seed Author ${authorId}`,
      isPrimary: true,
    })
    .run();

  return book;
}

export function seedEdition(
  db: Db,
  bookId: number,
  overrides: Partial<typeof schema.editions.$inferInsert> = {},
): InferSelectModel<typeof schema.editions> {
  const rows = db
    .insert(schema.editions)
    .values({
      bookId,
      title: "Test Book - Hardcover Edition",
      isbn13: "9781234567890",
      format: "Hardcover",
      pageCount: 320,
      publisher: "Test Publisher",
      language: "English",
      languageCode: "en",
      foreignEditionId: "hc-edition-1",
      images: [{ url: "https://example.com/edition.jpg", coverType: "cover" }],
      contributors: [],
      ...overrides,
    })
    .returning()
    .all();
  return rows[0];
}

export function seedDownloadClient(
  db: Db,
  overrides: Partial<typeof schema.downloadClients.$inferInsert> = {},
): InferSelectModel<typeof schema.downloadClients> {
  const rows = db
    .insert(schema.downloadClients)
    .values({
      name: "Test qBittorrent",
      implementation: "qBittorrent",
      protocol: "torrent",
      enabled: true,
      priority: 1,
      host: "localhost",
      port: PORTS.QBITTORRENT,
      useSsl: false,
      username: "admin",
      password: "adminadmin",
      category: "allstarr",
      removeCompletedDownloads: true,
      ...overrides,
    })
    .returning()
    .all();
  return rows[0];
}

export function seedIndexer(
  db: Db,
  overrides: Partial<typeof schema.indexers.$inferInsert> = {},
): InferSelectModel<typeof schema.indexers> {
  const rows = db
    .insert(schema.indexers)
    .values({
      name: "Test Newznab",
      implementation: "Newznab",
      protocol: "usenet",
      baseUrl: `http://localhost:${PORTS.NEWZNAB}`,
      apiPath: "/api",
      apiKey: "test-api-key",
      categories: "[]",
      enableRss: true,
      enableAutomaticSearch: true,
      enableInteractiveSearch: true,
      priority: 25,
      ...overrides,
    })
    .returning()
    .all();
  return rows[0];
}

export function seedTrackedDownload(
  db: Db,
  overrides: Partial<typeof schema.trackedDownloads.$inferInsert> = {},
): InferSelectModel<typeof schema.trackedDownloads> {
  const rows = db
    .insert(schema.trackedDownloads)
    .values({
      downloadClientId: 1,
      downloadId: `dl-${Date.now()}`,
      releaseTitle: "Test Author - Test Book [EPUB]",
      protocol: "torrent",
      state: "queued",
      ...overrides,
    })
    .returning()
    .all();
  return rows[0];
}

export function seedBlocklistEntry(
  db: Db,
  overrides: Partial<typeof schema.blocklist.$inferInsert> = {},
): InferSelectModel<typeof schema.blocklist> {
  const rows = db
    .insert(schema.blocklist)
    .values({
      sourceTitle: "Bad Release - Test Book [EPUB]",
      protocol: "torrent",
      indexer: "Test Indexer",
      message: "Quality not met",
      source: "automatic",
      ...overrides,
    })
    .returning()
    .all();
  return rows[0];
}

export function seedSetting(
  db: Db,
  key: string,
  value: string | number | boolean | null,
): InferSelectModel<typeof schema.settings> {
  const rows = db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value },
    })
    .returning()
    .all();
  return rows[0];
}
