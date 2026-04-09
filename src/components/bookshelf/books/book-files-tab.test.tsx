import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) => <section data-value={value}>{children}</section>,
}));

import BookFilesTab from "./book-files-tab";

describe("BookFilesTab", () => {
	it("shows an empty state when no files exist", async () => {
		await renderWithProviders(<BookFilesTab files={[]} />);

		await expect.element(page.getByText("No book files")).toBeInTheDocument();
		await expect
			.element(page.getByText("No files have been imported for this book yet."))
			.toBeInTheDocument();
	});

	it("renders audio and ebook metadata columns when both file types are present", async () => {
		const files = [
			{
				id: 1,
				path: "/library/audio/part-1.m4b",
				size: 1024,
				quality: {
					quality: { id: 1, name: "High" },
					revision: { version: 1, real: 1 },
				},
				dateAdded: new Date("2025-01-02T15:04:05Z"),
				part: 2,
				partCount: 4,
				duration: 3660,
				bitrate: 128000,
				codec: "mp3",
				pageCount: null,
			},
			{
				id: 2,
				path: "/library/ebook/book.epub",
				size: 2048,
				quality: {
					quality: { id: 2, name: "Imported" },
					revision: { version: 1, real: 1 },
				},
				dateAdded: new Date("2025-02-03T15:04:05Z"),
				part: null,
				partCount: null,
				duration: null,
				bitrate: null,
				codec: null,
				pageCount: 300,
			},
		] as const;

		await renderWithProviders(<BookFilesTab files={files as never} />);

		await expect.element(page.getByText("Path")).toBeInTheDocument();
		await expect.element(page.getByText("Size")).toBeInTheDocument();
		await expect.element(page.getByText("Format")).toBeInTheDocument();
		await expect
			.element(page.getByText("Part", { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Duration")).toBeInTheDocument();
		await expect.element(page.getByText("Bitrate")).toBeInTheDocument();
		await expect.element(page.getByText("Codec")).toBeInTheDocument();
		await expect.element(page.getByText("Pages")).toBeInTheDocument();
		await expect.element(page.getByText("Date Added")).toBeInTheDocument();

		await expect
			.element(page.getByText("/library/audio/part-1.m4b"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/library/ebook/book.epub"))
			.toBeInTheDocument();
		await expect.element(page.getByText("1 KB")).toBeInTheDocument();
		await expect.element(page.getByText("2 KB")).toBeInTheDocument();
		await expect.element(page.getByText("High")).toBeInTheDocument();
		await expect.element(page.getByText("Imported")).toBeInTheDocument();
		await expect.element(page.getByText("Part 2 of 4")).toBeInTheDocument();
		await expect.element(page.getByText("1h 1m")).toBeInTheDocument();
		await expect.element(page.getByText("128 kbps")).toBeInTheDocument();
		await expect.element(page.getByText("mp3")).toBeInTheDocument();
		await expect.element(page.getByText("300")).toBeInTheDocument();
		await expect
			.element(
				page.getByText(new Date("2025-01-02T15:04:05Z").toLocaleDateString()),
			)
			.toBeInTheDocument();
		await expect
			.element(
				page.getByText(new Date("2025-02-03T15:04:05Z").toLocaleDateString()),
			)
			.toBeInTheDocument();
	});
});
