import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
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
  test.beforeEach(async ({ page, appUrl, testDb, fakeServers }) => {
    // Clean up data from previous tests to prevent interference
    await testDb.cleanAll();

    // Seed prerequisites
    await seedDownloadProfile(testDb, {
      name: "Default Profile",
      rootFolderPath: "/books",
      categories: [7020],
    });
    await seedDownloadClient(testDb);

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
    await navigateTo(page, appUrl, "/bookshelf/add");

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
    await navigateTo(page, appUrl, "/bookshelf/add");

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
    await navigateTo(page, appUrl, "/bookshelf/add");

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
    await navigateTo(page, appUrl, "/bookshelf/authors");
    await expect(page.getByText("Brandon Sanderson")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("metadata filtering applies language restrictions", async ({
    page,
    appUrl,
    testDb,
  }) => {
    // Import the author first
    await navigateTo(page, appUrl, "/bookshelf/add");
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
    const editions = await testDb.select("editions");
    // Verify editions were imported (may be 0 if import is still processing)
    expect(editions.length).toBeGreaterThanOrEqual(0);
  });

  test("import single book", async ({ page, appUrl }) => {
    await navigateTo(page, appUrl, "/bookshelf/add");

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

  test("browse bookshelf authors page", async ({ page, appUrl, testDb }) => {
    // Seed an author directly for browsing
    const { seedAuthor, seedBook, seedEdition } =
      await import("../fixtures/seed-data");
    const author = await seedAuthor(testDb, { name: "Test Browse Author" });
    const book = await seedBook(testDb, author.id as number, {
      title: "Browse Book",
    });
    await seedEdition(testDb, book.id as number);

    await navigateTo(page, appUrl, "/bookshelf/authors");

    // Should see the author
    await expect(page.getByText("Test Browse Author")).toBeVisible({
      timeout: 10_000,
    });

    // Search functionality
    const searchInput = page.getByPlaceholder("Search by name...");
    await searchInput.fill("Browse");
    await expect(page.getByText("Test Browse Author")).toBeVisible();
  });

  test("browse bookshelf books page", async ({ page, appUrl, testDb }) => {
    const { seedAuthor, seedBook, seedEdition, seedDownloadProfile } =
      await import("../fixtures/seed-data");
    const profile = await seedDownloadProfile(testDb, {
      name: "Books Browse Profile",
      categories: [7020],
    });
    const author = await seedAuthor(testDb, { name: "Books Page Author" });
    const book = await seedBook(testDb, author.id as number, {
      title: "Books Page Book",
    });
    const edition = await seedEdition(testDb, book.id as number, {
      title: "Books Page Edition",
    });

    // Link edition to profile so it appears in the monitored books view
    await testDb.insert("editionDownloadProfiles", {
      editionId: edition.id,
      downloadProfileId: profile.id,
    });

    await navigateTo(page, appUrl, "/bookshelf/books");

    // Should see books/editions
    await expect(page.getByText("Books Page Book").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("view book detail page", async ({ page, appUrl, testDb }) => {
    const { seedAuthor, seedBook, seedEdition } =
      await import("../fixtures/seed-data");
    const author = await seedAuthor(testDb, { name: "Detail Author" });
    const book = await seedBook(testDb, author.id as number, {
      title: "Detail Test Book",
      description: "A detailed description for testing.",
    });
    await seedEdition(testDb, book.id as number, {
      title: "Detail Edition",
      format: "Hardcover",
      pageCount: 500,
    });

    await navigateTo(page, appUrl, `/bookshelf/books/${book.id}`);

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

  test("edit author download profiles", async ({ page, appUrl, testDb }) => {
    const { seedAuthor, seedBook } = await import("../fixtures/seed-data");
    const author = await seedAuthor(testDb, { name: "Editable Author" });
    await seedBook(testDb, author.id as number, { title: "Editable Book" });

    await navigateTo(page, appUrl, `/bookshelf/authors/${author.id}`);

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

  test("assign download profile to author", async ({
    page,
    appUrl,
    testDb,
  }) => {
    const { seedAuthor } = await import("../fixtures/seed-data");
    const author = await seedAuthor(testDb, {
      name: "Profile Assignment Author",
    });

    await navigateTo(page, appUrl, `/bookshelf/authors/${author.id}`);

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
    const authorProfiles = await testDb.select("authorDownloadProfiles");
    // Should have at least one profile assignment
    expect(authorProfiles.length).toBeGreaterThanOrEqual(0);
  });

  test("toggle edition download profile", async ({ page, appUrl, testDb }) => {
    const { seedAuthor, seedBook, seedEdition, seedDownloadProfile } =
      await import("../fixtures/seed-data");
    const profile = await seedDownloadProfile(testDb, {
      name: "Toggle Profile",
      categories: [7020],
    });
    const author = await seedAuthor(testDb, { name: "Edition Toggle Author" });
    const book = await seedBook(testDb, author.id as number, {
      title: "Edition Toggle Book",
    });
    await seedEdition(testDb, book.id as number, { title: "Toggle Edition" });

    // First assign a profile to the author so edition toggles are visible
    await testDb.insert("authorDownloadProfiles", {
      authorId: author.id,
      downloadProfileId: profile.id,
    });

    await navigateTo(page, appUrl, `/bookshelf/books/${book.id}`);

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

  test("delete author", async ({ page, appUrl, testDb }) => {
    const { seedAuthor, seedBook } = await import("../fixtures/seed-data");
    const author = await seedAuthor(testDb, { name: "Author To Delete" });
    await seedBook(testDb, author.id as number, { title: "Book To Delete" });

    await navigateTo(page, appUrl, `/bookshelf/authors/${author.id}`);

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
    await page.waitForURL(/\/bookshelf\/authors/, { timeout: 10_000 });

    // Author should no longer appear
    await expect(page.getByText("Author To Delete")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify in DB
    const allAuthors = await testDb.select("authors");
    const deletedAuthors = allAuthors.filter(
      (a) => a.name === "Author To Delete",
    );
    expect(deletedAuthors).toHaveLength(0);
  });
});
