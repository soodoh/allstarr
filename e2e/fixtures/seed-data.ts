import type { TestDbClient } from "./test-db-client";
import PORTS from "../ports";

export async function seedDownloadProfile(
  client: TestDbClient,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await client.insert("downloadProfiles", {
    name: "Default Profile",
    rootFolderPath: "/books",
    cutoff: 1,
    items: [1, 2, 3, 4, 5],
    upgradeAllowed: false,
    icon: "book-open",
    categories: [],
    ...overrides,
  });
}

export async function seedAuthor(
  client: TestDbClient,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await client.insert("authors", {
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
  });
}

export async function seedBook(
  client: TestDbClient,
  authorId: number,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const book = await client.insert("books", {
    title: "Test Book",
    slug: "test-book",
    description: "A test book for e2e tests.",
    releaseYear: 2024,
    foreignBookId: "hc-book-1",
    images: [{ url: "https://example.com/book.jpg", coverType: "cover" }],
    tags: [],
    ...overrides,
  });

  // Create the booksAuthors join row
  await client.insert("booksAuthors", {
    bookId: book.id,
    authorId,
    foreignAuthorId: "hc-author-1",
    authorName: "Test Author",
    isPrimary: true,
  });

  return book;
}

export async function seedEdition(
  client: TestDbClient,
  bookId: number,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await client.insert("editions", {
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
  });
}

export async function seedDownloadClient(
  client: TestDbClient,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await client.insert("downloadClients", {
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
  });
}

export async function seedIndexer(
  client: TestDbClient,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await client.insert("indexers", {
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
  });
}

export async function seedTrackedDownload(
  client: TestDbClient,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await client.insert("trackedDownloads", {
    downloadClientId: 1,
    downloadId: `dl-${Date.now()}`,
    releaseTitle: "Test Author - Test Book [EPUB]",
    protocol: "torrent",
    state: "queued",
    ...overrides,
  });
}

export async function seedBlocklistEntry(
  client: TestDbClient,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await client.insert("blocklist", {
    sourceTitle: "Bad Release - Test Book [EPUB]",
    protocol: "torrent",
    indexer: "Test Indexer",
    message: "Quality not met",
    source: "automatic",
    ...overrides,
  });
}

export async function seedSetting(
  client: TestDbClient,
  key: string,
  value: string | number | boolean | null,
): Promise<Record<string, unknown>> {
  return await client.insert("settings", { key, value });
}
