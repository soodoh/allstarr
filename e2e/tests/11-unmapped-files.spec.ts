import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { test, expect } from "../fixtures/app";
import { ensureAuthenticated } from "../helpers/auth";
import navigateTo from "../helpers/navigation";
import * as schema from "../../src/db/schema";
import {
  seedAuthor,
  seedBook,
  seedDownloadProfile,
} from "../fixtures/seed-data";

type SeededUnmappedFile = {
  id: number;
  filename: string;
  path: string;
};

type SeededUnmappedTvFile = SeededUnmappedFile & {
  sidecarPaths: string[];
  sourceDir: string;
};

function seedUnmappedFile(
  db: Parameters<typeof seedAuthor>[0],
  rootFolderPath: string,
  filename: string,
  overrides: Partial<typeof schema.unmappedFiles.$inferInsert> = {},
): SeededUnmappedFile {
  const incomingDir = join(rootFolderPath, "incoming");
  mkdirSync(incomingDir, { recursive: true });

  const filePath = join(incomingDir, filename);
  writeFileSync(filePath, "dummy epub content");

  const row = db
    .insert(schema.unmappedFiles)
    .values({
      path: filePath,
      size: 1024,
      rootFolderPath,
      contentType: "ebook",
      format: "EPUB",
      quality: {
        quality: { id: 4, name: "EPUB" },
        revision: { version: 1, real: 0 },
      },
      hints: {
        title: "Mapped Book",
        author: "Mapped Author",
        source: "filename",
      },
      ignored: false,
      ...overrides,
    })
    .returning()
    .get();

  return {
    id: row.id,
    filename,
    path: filePath,
  };
}

function seedUnmappedEbook(
  db: Parameters<typeof seedAuthor>[0],
  rootFolderPath: string,
  filename: string,
): SeededUnmappedFile {
  return seedUnmappedFile(db, rootFolderPath, filename);
}

function seedUnmappedTvFile(
  db: Parameters<typeof seedAuthor>[0],
  rootFolderPath: string,
  filename: string,
  episodeNumber: number,
  sidecarFilenames: string[] = [],
): SeededUnmappedTvFile {
  const sourceDir = join(rootFolderPath, "incoming", "severance");
  mkdirSync(sourceDir, { recursive: true });

  const filePath = join(sourceDir, filename);
  writeFileSync(filePath, "dummy tv content");

  const sidecarPaths = sidecarFilenames.map((sidecarFilename) => {
    const sidecarPath = join(sourceDir, sidecarFilename);
    mkdirSync(dirname(sidecarPath), { recursive: true });
    writeFileSync(sidecarPath, `dummy sidecar content for ${sidecarFilename}`);

    const extension = sidecarFilename.split(".").pop()?.toUpperCase() ?? "TXT";
    db.insert(schema.unmappedFiles)
      .values({
        path: sidecarPath,
        size: 64,
        rootFolderPath,
        contentType: "tv",
        format: extension,
        quality: null,
        hints: {
          source: "filename",
          title: "Severance",
          season: 1,
          episode: episodeNumber,
        },
        ignored: false,
      })
      .run();

    return sidecarPath;
  });

  const row = db
    .insert(schema.unmappedFiles)
    .values({
      path: filePath,
      size: 1024 * 1024 * 4,
      rootFolderPath,
      contentType: "tv",
      format: "MKV",
      quality: {
        quality: { id: 4, name: "1080p" },
        revision: { version: 1, real: 0 },
      },
      hints: {
        title: "Severance",
        episode: episodeNumber,
        season: 1,
        source: "filename",
      },
      ignored: false,
    })
    .returning()
    .get();

  return {
    id: row.id,
    filename,
    path: filePath,
    sidecarPaths,
    sourceDir,
  };
}

function seedTvLibrary(
  db: Parameters<typeof seedAuthor>[0],
  rootFolderPath: string,
) {
  const profile = seedDownloadProfile(db, {
    name: "Unmapped TV Profile",
    rootFolderPath,
    contentType: "tv",
    icon: "tv",
  });

  const show = db
    .insert(schema.shows)
    .values({
      title: "Severance",
      sortTitle: "Severance",
      overview: "A test show for unmapped TV mapping e2e coverage.",
      tmdbId: 2022,
      imdbId: "tt2022",
      status: "continuing",
      seriesType: "standard",
      network: "Test Network",
      year: 2022,
      runtime: 55,
      genres: ["Drama"],
      tags: [],
      posterUrl: "https://example.com/severance-poster.jpg",
      fanartUrl: "https://example.com/severance-fanart.jpg",
      path: "",
      useSeasonFolder: 1,
      monitorNewSeasons: "all",
    })
    .returning()
    .get();

  const season = db
    .insert(schema.seasons)
    .values({
      showId: show.id,
      seasonNumber: 1,
      overview: "Season 1",
      posterUrl: "https://example.com/severance-season-1.jpg",
    })
    .returning()
    .get();

  const episodes = db
    .insert(schema.episodes)
    .values([
      {
        showId: show.id,
        seasonId: season.id,
        episodeNumber: 1,
        title: "Episode One",
        tmdbId: 202201,
        hasFile: false,
      },
      {
        showId: show.id,
        seasonId: season.id,
        episodeNumber: 2,
        title: "Episode Two",
        tmdbId: 202202,
        hasFile: false,
      },
      {
        showId: show.id,
        seasonId: season.id,
        episodeNumber: 3,
        title: "Episode Three",
        tmdbId: 202203,
        hasFile: false,
      },
    ])
    .returning()
    .all();

  return { episodes, profile, season, show };
}

test.describe("Unmapped Files", () => {
  test.beforeEach(async ({ page, appUrl, db }) => {
    await ensureAuthenticated(page, appUrl);

    db.delete(schema.history).run();
    db.delete(schema.episodeFiles).run();
    db.delete(schema.episodeDownloadProfiles).run();
    db.delete(schema.showDownloadProfiles).run();
    db.delete(schema.seriesBookLinks).run();
    db.delete(schema.episodes).run();
    db.delete(schema.seasons).run();
    db.delete(schema.shows).run();
    db.delete(schema.bookFiles).run();
    db.delete(schema.unmappedFiles).run();
    db.delete(schema.editions).run();
    db.delete(schema.booksAuthors).run();
    db.delete(schema.books).run();
    db.delete(schema.authors).run();
    db.delete(schema.downloadProfiles).run();
  });

  test("ignore and unignore an unmapped file", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    const file = seedUnmappedEbook(db, tempDir, "ignored-book.epub");
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();

    await page.getByTitle("Ignore").click();

    await expect(page.getByText(file.filename, { exact: true })).toHaveCount(0);
    await expect
      .poll(() =>
        db
          .select({ ignored: schema.unmappedFiles.ignored })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.id, file.id))
          .get()?.ignored ?? null,
      )
      .toBe(true);

    await page.getByRole("button", { name: "Show Ignored" }).click();
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();

    await page.getByTitle("Unignore").click();

    await expect
      .poll(() =>
        db
          .select({ ignored: schema.unmappedFiles.ignored })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.id, file.id))
          .get()?.ignored ?? null,
      )
      .toBe(false);

    await page.getByRole("button", { name: "Showing Ignored" }).click();
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();
  });

  test("map an unmapped ebook to an existing book", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    const profile = seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    const author = seedAuthor(db, {
      name: "Mapped Author",
      sortName: "Author, Mapped",
      slug: "mapped-author",
      foreignAuthorId: "mapped-author-1",
    });
    const book = seedBook(db, author.id, {
      title: "Mapped Book",
      slug: "mapped-book",
      foreignBookId: "mapped-book-1",
      releaseYear: 2025,
    });
    const file = seedUnmappedEbook(db, tempDir, "mapped-book.epub");
    const expectedPath = join(
      tempDir,
      "Mapped Author",
      "Mapped Book (2025)",
      file.filename,
    );
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();

    await page.getByTitle("Map to library entry").click();
    await expect(
      page.getByRole("heading", { name: "Map 1 file" }),
    ).toBeVisible();

    const searchInput = page.getByLabel("Search Library");
    await searchInput.fill("Mapped Book");
    await expect(page.getByText("Mapped Book", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Map Here" }).click();

    await expect(page.getByText(file.filename, { exact: true })).toHaveCount(0);
    await expect(page.getByText("No unmapped files")).toBeVisible();

    await expect
      .poll(() =>
        db
          .select({ id: schema.unmappedFiles.id })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.id, file.id))
          .get() ?? null,
      )
      .toBeNull();

    await expect
      .poll(() =>
        db
          .select({
            bookId: schema.bookFiles.bookId,
            downloadProfileId: schema.bookFiles.downloadProfileId,
            path: schema.bookFiles.path,
          })
          .from(schema.bookFiles)
          .where(eq(schema.bookFiles.bookId, book.id))
          .get() ?? null,
      )
      .toEqual({
        bookId: book.id,
        downloadProfileId: profile.id,
        path: expectedPath,
      });

    await expect.poll(() => existsSync(expectedPath)).toBe(true);
    await expect.poll(() => existsSync(file.path)).toBe(false);

    await expect
      .poll(() =>
        db
          .select({
            eventType: schema.history.eventType,
            bookId: schema.history.bookId,
          })
          .from(schema.history)
          .where(eq(schema.history.bookId, book.id))
          .get() ?? null,
      )
      .toEqual({
        eventType: "bookFileAdded",
        bookId: book.id,
      });
  });

  test("maps TV rows with distinct episode targets and moves related sidecars", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    const { episodes, show } = seedTvLibrary(db, tempDir);

    const firstFile = seedUnmappedTvFile(
      db,
      tempDir,
      "Severance.S01E01.mkv",
      1,
      ["Severance.S01E01.nfo", "Severance.S01E01.xml"],
    );
    const secondFile = seedUnmappedTvFile(
      db,
      tempDir,
      "Severance.S01E02.mkv",
      2,
      ["Severance.S01E02.nfo", "Severance.S01E02.xml"],
    );

    const sourceFolderFile = join(firstFile.sourceDir, "folder.jpg");
    writeFileSync(sourceFolderFile, "keep me in the source tree");

    const destinationSeasonDir = join(
      tempDir,
      `${show.title} (${show.year})`,
      "Season 01",
    );
    mkdirSync(destinationSeasonDir, { recursive: true });
    const destinationSidecarFile = join(destinationSeasonDir, "readme.txt");
    writeFileSync(destinationSidecarFile, "keep me in the destination tree");

    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText(firstFile.filename, { exact: true })).toBeVisible();
    await expect(
      page.getByText(secondFile.filename, { exact: true }),
    ).toBeVisible();

    const firstVideoRow = page
      .getByText(firstFile.filename, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'flex items-center gap-3')][1]");
    const secondVideoRow = page
      .getByText(secondFile.filename, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'flex items-center gap-3')][1]");

    await firstVideoRow.getByRole("checkbox").click();
    await secondVideoRow.getByRole("checkbox").click();

    await expect(page.getByText("2 files selected")).toBeVisible();
    await page.getByRole("button", { name: "Map Selected" }).click();

    await expect(
      page.getByRole("heading", { name: "Map 2 files" }),
    ).toBeVisible();
    await expect(
      page.getByText("Search episodes for Severance.S01E01.mkv", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Search episodes for Severance.S01E02.mkv", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("S01E01 - Episode One").first()).toBeVisible();
    await expect(page.getByText("S01E02 - Episode Two").first()).toBeVisible();

    await page.getByLabel("Move related sidecar files").click();
    await page.getByRole("button", { name: "Map Selected Files" }).click();

    const firstDestPath = join(
      destinationSeasonDir,
      "Severance S01E01.mkv",
    );
    const secondDestPath = join(
      destinationSeasonDir,
      "Severance S01E02.mkv",
    );
    const firstSidecarNfoDest = join(
      destinationSeasonDir,
      "Severance S01E01.nfo",
    );
    const firstSidecarXmlDest = join(
      destinationSeasonDir,
      "Severance S01E01.xml",
    );
    const secondSidecarNfoDest = join(
      destinationSeasonDir,
      "Severance S01E02.nfo",
    );
    const secondSidecarXmlDest = join(
      destinationSeasonDir,
      "Severance S01E02.xml",
    );

    await expect(page.getByText("No unmapped files")).toBeVisible();

    for (const file of [firstFile, secondFile]) {
      await expect
        .poll(() =>
          db
            .select({ id: schema.unmappedFiles.id })
            .from(schema.unmappedFiles)
            .where(eq(schema.unmappedFiles.path, file.path))
            .get() ?? null,
        )
        .toBeNull();
    }

    for (const sidecarPath of [
      ...firstFile.sidecarPaths,
      ...secondFile.sidecarPaths,
    ]) {
      await expect
        .poll(() =>
          db
            .select({ id: schema.unmappedFiles.id })
            .from(schema.unmappedFiles)
            .where(eq(schema.unmappedFiles.path, sidecarPath))
            .get() ?? null,
        )
        .toBeNull();
    }

    await expect.poll(() => existsSync(firstDestPath)).toBe(true);
    await expect.poll(() => existsSync(secondDestPath)).toBe(true);
    await expect.poll(() => existsSync(firstSidecarNfoDest)).toBe(true);
    await expect.poll(() => existsSync(firstSidecarXmlDest)).toBe(true);
    await expect.poll(() => existsSync(secondSidecarNfoDest)).toBe(true);
    await expect.poll(() => existsSync(secondSidecarXmlDest)).toBe(true);
    await expect.poll(() => existsSync(sourceFolderFile)).toBe(true);
    await expect.poll(() => existsSync(destinationSidecarFile)).toBe(true);
  });

  test("delete an unmapped file from disk", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    const file = seedUnmappedEbook(db, tempDir, "delete-me.epub");
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();

    await page.getByTitle("Delete file").click();
    await expect(
      page.getByRole("heading", { name: "Delete files" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText(file.filename, { exact: true })).toHaveCount(0);
    await expect(page.getByText("No unmapped files")).toBeVisible();

    await expect
      .poll(() =>
        db
          .select({ id: schema.unmappedFiles.id })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.id, file.id))
          .get() ?? null,
      )
      .toBeNull();

    await expect.poll(() => existsSync(file.path)).toBe(false);
  });

  test("bulk delete selected unmapped files", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    const firstFile = seedUnmappedEbook(db, tempDir, "bulk-delete-1.epub");
    const secondFile = seedUnmappedEbook(db, tempDir, "bulk-delete-2.epub");
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(
      page.getByText(firstFile.filename, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(secondFile.filename, { exact: true }),
    ).toBeVisible();

    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();

    await expect(page.getByText("2 files selected")).toBeVisible();
    await page.getByRole("button", { name: "Delete Selected" }).click();

    await expect(
      page.getByRole("heading", { name: "Delete files" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText(firstFile.filename, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText(secondFile.filename, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("No unmapped files")).toBeVisible();

    for (const file of [firstFile, secondFile]) {
      await expect
        .poll(() =>
          db
            .select({ id: schema.unmappedFiles.id })
            .from(schema.unmappedFiles)
            .where(eq(schema.unmappedFiles.id, file.id))
            .get() ?? null,
        )
        .toBeNull();

      await expect.poll(() => existsSync(file.path)).toBe(false);
    }
  });

  test("bulk ignore and restore selected unmapped files", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    const firstFile = seedUnmappedEbook(db, tempDir, "bulk-ignore-1.epub");
    const secondFile = seedUnmappedEbook(db, tempDir, "bulk-ignore-2.epub");
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(
      page.getByText(firstFile.filename, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(secondFile.filename, { exact: true }),
    ).toBeVisible();

    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();

    await expect(page.getByText("2 files selected")).toBeVisible();
    await page.getByRole("button", { name: "Ignore Selected" }).click();

    await expect(page.getByText(firstFile.filename, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText(secondFile.filename, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("No unmapped files")).toBeVisible();

    for (const file of [firstFile, secondFile]) {
      await expect
        .poll(() =>
          db
            .select({ ignored: schema.unmappedFiles.ignored })
            .from(schema.unmappedFiles)
            .where(eq(schema.unmappedFiles.id, file.id))
            .get()?.ignored ?? null,
        )
        .toBe(true);
    }

    await page.getByRole("button", { name: "Show Ignored" }).click();
    await expect(
      page.getByText(firstFile.filename, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(secondFile.filename, { exact: true }),
    ).toBeVisible();

    const ignoredCheckboxes = page.getByRole("checkbox");
    await ignoredCheckboxes.nth(1).click();
    await ignoredCheckboxes.nth(2).click();
    await expect(page.getByText("2 files selected")).toBeVisible();
    await page.getByRole("button", { name: "Unignore Selected" }).click();

    for (const file of [firstFile, secondFile]) {
      await expect
        .poll(() =>
          db
            .select({ ignored: schema.unmappedFiles.ignored })
            .from(schema.unmappedFiles)
            .where(eq(schema.unmappedFiles.id, file.id))
            .get()?.ignored ?? null,
        )
        .toBe(false);
    }

    await page.getByRole("button", { name: "Showing Ignored" }).click();
    await expect(
      page.getByText(firstFile.filename, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(secondFile.filename, { exact: true }),
    ).toBeVisible();
  });

  test("rescan removes stale unmapped files missing from disk", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    const file = seedUnmappedEbook(db, tempDir, "rescan-stale.epub");
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();

    unlinkSync(file.path);
    await expect.poll(() => existsSync(file.path)).toBe(false);

    await page.getByRole("button", { name: "Rescan", exact: true }).click();

    await expect(page.getByText(file.filename, { exact: true })).toHaveCount(0);
    await expect(page.getByText("No unmapped files")).toBeVisible();

    await expect
      .poll(() =>
        db
          .select({ id: schema.unmappedFiles.id })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.id, file.id))
          .get() ?? null,
      )
      .toBeNull();
  });

  test("rescan all discovers newly added unmapped files", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText("No unmapped files")).toBeVisible();

    const incomingDir = join(tempDir, "incoming");
    mkdirSync(incomingDir, { recursive: true });
    const filePath = join(incomingDir, "rescan-all-new.epub");
    writeFileSync(filePath, "dummy epub content");

    await page.getByRole("button", { name: "Rescan All" }).click();

    await expect(
      page.getByText("rescan-all-new.epub", { exact: true }),
    ).toBeVisible();

    await expect
      .poll(() =>
        db
          .select({
            path: schema.unmappedFiles.path,
            rootFolderPath: schema.unmappedFiles.rootFolderPath,
          })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.path, filePath))
          .get() ?? null,
      )
      .toEqual({
        path: filePath,
        rootFolderPath: tempDir,
      });
  });

  test("rescan all discovers newly added files across multiple root folders", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    const secondRoot = `${tempDir}-secondary`;

    seedDownloadProfile(db, {
      name: "Primary Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    seedDownloadProfile(db, {
      name: "Secondary Unmapped Ebook Profile",
      rootFolderPath: secondRoot,
      contentType: "ebook",
    });
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText("No unmapped files")).toBeVisible();

    const primaryIncomingDir = join(tempDir, "incoming");
    mkdirSync(primaryIncomingDir, { recursive: true });
    const primaryFilePath = join(primaryIncomingDir, "rescan-all-primary.epub");
    writeFileSync(primaryFilePath, "primary dummy epub content");

    const secondaryIncomingDir = join(secondRoot, "incoming");
    mkdirSync(secondaryIncomingDir, { recursive: true });
    const secondaryFilePath = join(
      secondaryIncomingDir,
      "rescan-all-secondary.epub",
    );
    writeFileSync(secondaryFilePath, "secondary dummy epub content");

    await page.getByRole("button", { name: "Rescan All" }).click();

    await expect(
      page.getByText("rescan-all-primary.epub", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("rescan-all-secondary.epub", { exact: true }),
    ).toBeVisible();

    await expect
      .poll(() =>
        db
          .select({
            path: schema.unmappedFiles.path,
            rootFolderPath: schema.unmappedFiles.rootFolderPath,
          })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.path, primaryFilePath))
          .get() ?? null,
      )
      .toEqual({
        path: primaryFilePath,
        rootFolderPath: tempDir,
      });

    await expect
      .poll(() =>
        db
          .select({
            path: schema.unmappedFiles.path,
            rootFolderPath: schema.unmappedFiles.rootFolderPath,
          })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.path, secondaryFilePath))
          .get() ?? null,
      )
      .toEqual({
        path: secondaryFilePath,
        rootFolderPath: secondRoot,
      });
  });

  test("ignored unmapped files stay ignored after rescan all", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    const file = seedUnmappedEbook(db, tempDir, "ignored-after-rescan.epub");
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();

    await page.getByTitle("Ignore").click();
    await expect(page.getByText(file.filename, { exact: true })).toHaveCount(0);

    await expect
      .poll(() =>
        db
          .select({ ignored: schema.unmappedFiles.ignored })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.id, file.id))
          .get()?.ignored ?? null,
      )
      .toBe(true);

    await page.getByRole("button", { name: "Rescan All" }).click();

    await expect(page.getByText(file.filename, { exact: true })).toHaveCount(0);

    await expect
      .poll(() =>
        db
          .select({ ignored: schema.unmappedFiles.ignored })
          .from(schema.unmappedFiles)
          .where(eq(schema.unmappedFiles.id, file.id))
          .get()?.ignored ?? null,
      )
      .toBe(true);

    await page.getByRole("button", { name: "Show Ignored" }).click();
    await expect(page.getByText(file.filename, { exact: true })).toBeVisible();
  });

  test("search and content-type filters narrow mixed unmapped entries", async ({
    page,
    appUrl,
    db,
    tempDir,
    checkpoint,
  }) => {
    const audiobookRoot = `${tempDir}-audio`;

    seedDownloadProfile(db, {
      name: "Unmapped Ebook Profile",
      rootFolderPath: tempDir,
      contentType: "ebook",
    });
    seedDownloadProfile(db, {
      name: "Unmapped Audiobook Profile",
      rootFolderPath: audiobookRoot,
      contentType: "audiobook",
    });

    const ebookFile = seedUnmappedFile(db, tempDir, "filter-ebook.epub", {
      contentType: "ebook",
      format: "EPUB",
      hints: {
        title: "Filter Ebook",
        author: "Filter Author",
        source: "filename",
      },
    });
    const audiobookFile = seedUnmappedFile(
      db,
      audiobookRoot,
      "filter-audio.m4b",
      {
        contentType: "audiobook",
        format: "M4B",
        hints: {
          title: "Filter Audio",
          author: "Filter Author",
          source: "filename",
        },
        quality: {
          quality: { id: 2, name: "M4B" },
          revision: { version: 1, real: 0 },
        },
      },
    );
    checkpoint();

    await navigateTo(page, appUrl, "/unmapped-files");
    await expect(page.getByText(ebookFile.filename, { exact: true })).toBeVisible();
    await expect(
      page.getByText(audiobookFile.filename, { exact: true }),
    ).toBeVisible();

    await page.getByPlaceholder("Search files...").fill("filter-ebook");
    await expect(page.getByText(ebookFile.filename, { exact: true })).toBeVisible();
    await expect(
      page.getByText(audiobookFile.filename, { exact: true }),
    ).toHaveCount(0);

    await page.getByPlaceholder("Search files...").clear();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Audiobooks" }).click();

    await expect(
      page.getByText(audiobookFile.filename, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(ebookFile.filename, { exact: true })).toHaveCount(
      0,
    );
  });
});
