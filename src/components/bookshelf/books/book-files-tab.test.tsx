import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({
		children,
		value,
	}: {
		children: React.ReactNode;
		value: string;
	}) => <section data-value={value}>{children}</section>,
}));

import BookFilesTab from "./book-files-tab";

describe("BookFilesTab", () => {
	it("shows an empty state when no files exist", () => {
		const { getByText } = renderWithProviders(<BookFilesTab files={[]} />);

		expect(getByText("No book files")).toBeInTheDocument();
		expect(
			getByText("No files have been imported for this book yet."),
		).toBeInTheDocument();
	});

	it("renders audio and ebook metadata columns when both file types are present", () => {
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

		const { getByText } = renderWithProviders(
			<BookFilesTab files={files as never} />,
		);

		expect(getByText("Path")).toBeInTheDocument();
		expect(getByText("Size")).toBeInTheDocument();
		expect(getByText("Format")).toBeInTheDocument();
		expect(getByText("Part")).toBeInTheDocument();
		expect(getByText("Duration")).toBeInTheDocument();
		expect(getByText("Bitrate")).toBeInTheDocument();
		expect(getByText("Codec")).toBeInTheDocument();
		expect(getByText("Pages")).toBeInTheDocument();
		expect(getByText("Date Added")).toBeInTheDocument();

		expect(getByText("/library/audio/part-1.m4b")).toBeInTheDocument();
		expect(getByText("/library/ebook/book.epub")).toBeInTheDocument();
		expect(getByText("1 KB")).toBeInTheDocument();
		expect(getByText("2 KB")).toBeInTheDocument();
		expect(getByText("High")).toBeInTheDocument();
		expect(getByText("Imported")).toBeInTheDocument();
		expect(getByText("Part 2 of 4")).toBeInTheDocument();
		expect(getByText("1h 1m")).toBeInTheDocument();
		expect(getByText("128 kbps")).toBeInTheDocument();
		expect(getByText("mp3")).toBeInTheDocument();
		expect(getByText("300")).toBeInTheDocument();
		expect(
			getByText(new Date("2025-01-02T15:04:05Z").toLocaleDateString()),
		).toBeInTheDocument();
		expect(
			getByText(new Date("2025-02-03T15:04:05Z").toLocaleDateString()),
		).toBeInTheDocument();
	});
});
