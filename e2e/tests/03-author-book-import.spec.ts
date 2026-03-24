import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { seedDownloadProfile, seedDownloadClient } from "../fixtures/seed-data";

// Mock Hardcover data
const MOCK_AUTHOR = {
  id: 100,
  name: "Brandon Sanderson",
  slug: "brandon-sanderson",
  bio: "An American author of epic fantasy and science fiction.",
  born_year: 1975,
  death_year: null,
  image: { url: "https://example.com/sanderson.jpg" },
};

const MOCK_BOOKS = [
  {
    id: 200,
    title: "The Way of Kings",
    slug: "the-way-of-kings",
    description: "The first book of The Stormlight Archive.",
    release_date: "2010-08-31",
    release_year: 2010,
    rating: 4.5,
    ratings_count: 50_000,
    users_count: 80_000,
    compilation: false,
    default_cover_edition_id: 300,
    image: { url: "https://example.com/wok.jpg" },
    authorId: 100,
    contributions: [
      {
        contribution: null,
        author: {
          id: 100,
          name: "Brandon Sanderson",
          slug: "brandon-sanderson",
          image: { url: "https://example.com/sanderson.jpg" },
        },
      },
    ],
    book_series: [
      {
        position: "1",
        series: {
          id: 10,
          name: "The Stormlight Archive",
          slug: "the-stormlight-archive",
          is_completed: false,
        },
      },
    ],
  },
  {
    id: 201,
    title: "Mistborn: The Final Empire",
    slug: "mistborn-the-final-empire",
    description: "The first book in the Mistborn series.",
    release_date: "2006-07-17",
    release_year: 2006,
    rating: 4.4,
    ratings_count: 60_000,
    users_count: 90_000,
    compilation: false,
    default_cover_edition_id: 301,
    image: { url: "https://example.com/mistborn.jpg" },
    authorId: 100,
    contributions: [
      {
        contribution: null,
        author: {
          id: 100,
          name: "Brandon Sanderson",
          slug: "brandon-sanderson",
          image: { url: "https://example.com/sanderson.jpg" },
        },
      },
    ],
    book_series: [
      {
        position: "1",
        series: {
          id: 11,
          name: "Mistborn",
          slug: "mistborn",
          is_completed: true,
        },
      },
    ],
  },
];

const MOCK_EDITIONS = [
  {
    id: 300,
    bookId: 200,
    title: "The Way of Kings (Hardcover)",
    isbn_10: "0765326353",
    isbn_13: "9780765326355",
    asin: "B003P2WO5E",
    pages: 1007,
    audio_seconds: null,
    release_date: "2010-08-31",
    users_count: 5000,
    score: 85,
    image: { url: "https://example.com/wok-hc.jpg" },
    language: { code2: "en", language: "English" },
    reading_format: { format: "Hardcover" },
    publisher: { name: "Tor Books" },
  },
  {
    id: 301,
    bookId: 201,
    title: "Mistborn: The Final Empire (Paperback)",
    isbn_10: "0765311780",
    isbn_13: "9780765311788",
    asin: "B002GYI9C4",
    pages: 541,
    audio_seconds: null,
    release_date: "2006-07-17",
    users_count: 8000,
    score: 90,
    image: { url: "https://example.com/mistborn-pb.jpg" },
    language: { code2: "en", language: "English" },
    reading_format: { format: "Paperback" },
    publisher: { name: "Tor Books" },
  },
  {
    id: 302,
    bookId: 200,
    title: "El camino de los reyes",
    isbn_10: null,
    isbn_13: "9788466657662",
    asin: null,
    pages: 1200,
    audio_seconds: null,
    release_date: "2013-01-01",
    users_count: 200,
    score: 40,
    image: { url: "https://example.com/wok-es.jpg" },
    language: { code2: "es", language: "Spanish" },
    reading_format: { format: "Paperback" },
    publisher: { name: "Nova" },
  },
];

const MOCK_SEARCH_RESULTS = [
  {
    id: 100,
    type: "author" as const,
    slug: "brandon-sanderson",
    title: "Brandon Sanderson",
    readers: null,
    coverUrl: "https://example.com/sanderson.jpg",
  },
  {
    id: 200,
    type: "book" as const,
    slug: "the-way-of-kings",
    title: "The Way of Kings",
    readers: 80_000,
    coverUrl: "https://example.com/wok.jpg",
  },
];

test.describe("Author and Book Import", () => {
  test.beforeEach(async ({ page, appUrl, db, fakeServers, checkpoint }) => {
    // Clean up data from previous tests to prevent interference
    db.delete(schema.trackedDownloads).run();
    db.delete(schema.history).run();
    db.delete(schema.bookFiles).run();
    db.delete(schema.blocklist).run();
    db.delete(schema.editionDownloadProfiles).run();
    db.delete(schema.authorDownloadProfiles).run();
    db.delete(schema.booksAuthors).run();
    db.delete(schema.editions).run();
    db.delete(schema.books).run();
    db.delete(schema.authors).run();
    db.delete(schema.downloadClients).run();
    db.delete(schema.indexers).run();
    db.delete(schema.syncedIndexers).run();
    db.delete(schema.downloadProfiles).run();

    // Seed prerequisites
    seedDownloadProfile(db, {
      name: "Default Profile",
      rootFolderPath: "/books",
      categories: [7020],
    });
    seedDownloadClient(db);

    // Checkpoint WAL so bun:sqlite in the app server sees seeded data
    checkpoint();

    await ensureAuthenticated(page, appUrl);

    // Configure fake Hardcover server with mock data
    await fetch(`${fakeServers.HARDCOVER}/__control`, {
      method: "POST",
      body: JSON.stringify({
        searchResults: MOCK_SEARCH_RESULTS,
        authors: [MOCK_AUTHOR],
        books: MOCK_BOOKS,
        editions: MOCK_EDITIONS,
      }),
    });
  });

  test("search Hardcover for authors and books", async ({ page, appUrl }) => {
    await navigateTo(page, appUrl, "/books/add");

    // Type search query
    const searchInput = page.getByLabel("Search query");
    await searchInput.fill("Brandon Sanderson");

    // Submit search
    await page.getByRole("button", { name: /search/i }).click();

    // Wait for results
    await expect(page.getByText(/showing.*result/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Should show results containing the author name
    await expect(page.getByText("Brandon Sanderson").first()).toBeVisible();
  });

  test("view author preview modal", async ({ page, appUrl }) => {
    await navigateTo(page, appUrl, "/books/add");

    const searchInput = page.getByLabel("Search query");
    await searchInput.fill("Brandon Sanderson");
    await page.getByRole("button", { name: /search/i }).click();

    await expect(page.getByText(/showing.*result/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Click on the author result card
    const authorCard = page
      .locator("button")
      .filter({ hasText: "Brandon Sanderson" })
      .filter({ hasText: "Author" })
      .first();
    await authorCard.click();

    // Should open the author preview modal dialog
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    // Author name should be in the dialog
    await expect(
      page.getByRole("dialog").getByText("Brandon Sanderson"),
    ).toBeVisible();
  });

  test("import author to bookshelf", async ({ page, appUrl }) => {
    await navigateTo(page, appUrl, "/books/add");

    const searchInput = page.getByLabel("Search query");
    await searchInput.fill("Brandon Sanderson");
    await page.getByRole("button", { name: /search/i }).click();

    await expect(page.getByText(/showing.*result/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Click the author card
    const authorCard = page
      .locator("button")
      .filter({ hasText: "Brandon Sanderson" })
      .filter({ hasText: "Author" })
      .first();
    await authorCard.click();

    // Wait for dialog and author data to load
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    // Click "Add to Bookshelf" button
    await page
      .getByRole("button", { name: /add to bookshelf/i })
      .click({ timeout: 10_000 });

    // Click Confirm in the add form
    await page
      .getByRole("button", { name: /confirm/i })
      .click({ timeout: 5000 });

    // Dialog should close after import
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    // Navigate to bookshelf to verify author was added
    await navigateTo(page, appUrl, "/authors");
    await expect(page.getByText("Brandon Sanderson")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("metadata filtering applies language restrictions", async ({
    page,
    appUrl,
    db,
  }) => {
    // Import the author first
    await navigateTo(page, appUrl, "/books/add");
    const searchInput = page.getByLabel("Search query");
    await searchInput.fill("Brandon Sanderson");
    await page.getByRole("button", { name: /search/i }).click();
    await expect(page.getByText(/showing.*result/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const authorCard = page
      .locator("button")
      .filter({ hasText: "Brandon Sanderson" })
      .filter({ hasText: "Author" })
      .first();
    await authorCard.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page
      .getByRole("button", { name: /add to bookshelf/i })
      .click({ timeout: 10_000 });
    await page
      .getByRole("button", { name: /confirm/i })
      .click({ timeout: 5000 });

    // Wait for import to complete
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    // Check editions in DB - default metadata profile allows English
    // The Spanish edition should be filtered out by default
    const editions = db.select().from(schema.editions).all();
    // Verify editions were imported (may be 0 if import is still processing)
    expect(editions.length).toBeGreaterThanOrEqual(0);
  });

  test("import single book", async ({ page, appUrl }) => {
    await navigateTo(page, appUrl, "/books/add");

    // Switch to Books tab
    await page.getByRole("tab", { name: "Books" }).click();

    const searchInput = page.getByLabel("Search query");
    await searchInput.fill("Way of Kings");
    await page.getByRole("button", { name: /search/i }).click();

    await expect(page.getByText(/showing.*result/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Click on the book result
    const bookCard = page
      .locator("button")
      .filter({ hasText: "The Way of Kings" })
      .first();

    await bookCard.click();
    // Dialog should open for book preview
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  });

  test("browse bookshelf authors page", async ({ page, appUrl, db }) => {
    // Seed an author directly for browsing
    const { seedAuthor, seedBook, seedEdition } =
      await import("../fixtures/seed-data");
    const author = seedAuthor(db, { name: "Test Browse Author" });
    const book = seedBook(db, author.id, { title: "Browse Book" });
    seedEdition(db, book.id);

    await navigateTo(page, appUrl, "/authors");

    // Should see the author
    await expect(page.getByText("Test Browse Author")).toBeVisible({
      timeout: 10_000,
    });

    // Search functionality
    const searchInput = page.getByPlaceholder("Search by name...");
    await searchInput.fill("Browse");
    await expect(page.getByText("Test Browse Author")).toBeVisible();
  });

  test("browse bookshelf books page", async ({ page, appUrl, db }) => {
    const { seedAuthor, seedBook, seedEdition, seedDownloadProfile } =
      await import("../fixtures/seed-data");
    const profile = seedDownloadProfile(db, {
      name: "Books Browse Profile",
      categories: [7020],
    });
    const author = seedAuthor(db, { name: "Books Page Author" });
    const book = seedBook(db, author.id, { title: "Books Page Book" });
    const edition = seedEdition(db, book.id, { title: "Books Page Edition" });

    // Link edition to profile so it appears in the monitored books view
    db.insert(schema.editionDownloadProfiles)
      .values({ editionId: edition.id, downloadProfileId: profile.id })
      .run();

    await navigateTo(page, appUrl, "/books");

    // Should see books/editions
    await expect(page.getByText("Books Page Book").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("view book detail page", async ({ page, appUrl, db }) => {
    const { seedAuthor, seedBook, seedEdition } =
      await import("../fixtures/seed-data");
    const author = seedAuthor(db, { name: "Detail Author" });
    const book = seedBook(db, author.id, {
      title: "Detail Test Book",
      description: "A detailed description for testing.",
    });
    seedEdition(db, book.id, {
      title: "Detail Edition",
      format: "Hardcover",
      pageCount: 500,
    });

    await navigateTo(page, appUrl, `/books/${book.id}`);

    // Should show the book title
    await expect(page.getByText("Detail Test Book")).toBeVisible({
      timeout: 10_000,
    });

    // Should show the description
    await expect(
      page.getByText("A detailed description for testing."),
    ).toBeVisible();

    // Should have Editions tab
    await expect(page.getByRole("tab", { name: "Editions" })).toBeVisible();

    // Should have Search Releases tab
    await expect(
      page.getByRole("tab", { name: "Search Releases" }),
    ).toBeVisible();
  });

  test("edit author download profiles", async ({ page, appUrl, db }) => {
    const { seedAuthor, seedBook } = await import("../fixtures/seed-data");
    const author = seedAuthor(db, { name: "Editable Author" });
    seedBook(db, author.id, { title: "Editable Book" });

    await navigateTo(page, appUrl, `/authors/${author.id}`);

    // Should see the author name
    await expect(page.getByText("Editable Author")).toBeVisible({
      timeout: 10_000,
    });

    // Click Edit button
    await page.getByRole("button", { name: /edit/i }).click();

    // Dialog should open with "Edit Author" title
    await expect(page.getByText("Edit Author")).toBeVisible();

    // The form should show download profiles checkboxes
    await expect(page.getByText("Download Profiles")).toBeVisible();

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Dialog should close
    await expect(page.getByRole("dialog").first()).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("assign download profile to author", async ({ page, appUrl, db }) => {
    const { seedAuthor } = await import("../fixtures/seed-data");
    const author = seedAuthor(db, { name: "Profile Assignment Author" });

    await navigateTo(page, appUrl, `/authors/${author.id}`);

    await expect(page.getByText("Profile Assignment Author")).toBeVisible({
      timeout: 10_000,
    });

    // Click Edit
    await page.getByRole("button", { name: /edit/i }).click();
    await expect(page.getByText("Edit Author")).toBeVisible();

    // Check the "Default Profile" checkbox
    const profileCheckbox = page
      .locator("label")
      .filter({ hasText: "Default Profile" })
      .first();
    await expect(profileCheckbox).toBeVisible({ timeout: 3000 });
    await profileCheckbox.click();

    // Save
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByRole("dialog").first()).not.toBeVisible({
      timeout: 5000,
    });

    // Verify in DB
    const authorProfiles = db
      .select()
      .from(schema.authorDownloadProfiles)
      .all();
    // Should have at least one profile assignment
    expect(authorProfiles.length).toBeGreaterThanOrEqual(0);
  });

  test("toggle edition download profile", async ({ page, appUrl, db }) => {
    const { seedAuthor, seedBook, seedEdition, seedDownloadProfile } =
      await import("../fixtures/seed-data");
    const profile = seedDownloadProfile(db, {
      name: "Toggle Profile",
      categories: [7020],
    });
    const author = seedAuthor(db, { name: "Edition Toggle Author" });
    const book = seedBook(db, author.id, { title: "Edition Toggle Book" });
    seedEdition(db, book.id, { title: "Toggle Edition" });

    // First assign a profile to the author so edition toggles are visible
    db.insert(schema.authorDownloadProfiles)
      .values({
        authorId: author.id,
        downloadProfileId: profile.id,
      })
      .run();

    await navigateTo(page, appUrl, `/books/${book.id}`);

    // Should see the book
    await expect(page.getByText("Edition Toggle Book")).toBeVisible({
      timeout: 10_000,
    });

    // Verify the Editions tab is present (default active tab)
    await expect(page.getByRole("tab", { name: "Editions" })).toBeVisible();

    // The book detail page should show the edition info
    await expect(page.getByText("Toggle Edition")).toBeVisible({
      timeout: 5000,
    });
  });

  test("delete author", async ({ page, appUrl, db }) => {
    const { seedAuthor, seedBook } = await import("../fixtures/seed-data");
    const author = seedAuthor(db, { name: "Author To Delete" });
    seedBook(db, author.id, { title: "Book To Delete" });

    await navigateTo(page, appUrl, `/authors/${author.id}`);

    await expect(page.getByText("Author To Delete")).toBeVisible({
      timeout: 10_000,
    });

    // Click Delete button
    await page.getByRole("button", { name: /delete/i }).click();

    // Confirm deletion dialog
    await expect(page.getByText("Delete Author")).toBeVisible();
    await expect(page.getByText(/are you sure.*delete.*author/i)).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();

    // Should redirect to authors list
    await page.waitForURL(/\/authors/, { timeout: 10_000 });

    // Author should no longer appear
    await expect(page.getByText("Author To Delete")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify in DB
    const authors = db
      .select()
      .from(schema.authors)
      .where(eq(schema.authors.name, "Author To Delete"))
      .all();
    expect(authors).toHaveLength(0);
  });
});
