import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function seedUnmappedEbook(
  db: Parameters<typeof seedAuthor>[0],
  rootFolderPath: string,
  filename: string,
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
    })
    .returning()
    .get();

  return {
    id: row.id,
    filename,
    path: filePath,
  };
}

test.describe("Unmapped Files", () => {
  test.beforeEach(async ({ page, appUrl, db }) => {
    await ensureAuthenticated(page, appUrl);

    db.delete(schema.history).run();
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
          })
          .from(schema.bookFiles)
          .where(eq(schema.bookFiles.path, file.path))
          .get() ?? null,
      )
      .toEqual({
        bookId: book.id,
        downloadProfileId: profile.id,
      });

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
});
