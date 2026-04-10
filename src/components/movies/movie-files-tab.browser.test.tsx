import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("lucide-react", () => ({
	Film: ({ className }: { className?: string }) => (
		<span className={className}>Film</span>
	),
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="empty-state">
			<span>{title}</span>
			<span>{description}</span>
		</div>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	CardHeader: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	CardTitle: ({ children }: { children: React.ReactNode }) => (
		<h2>{children}</h2>
	),
}));

import MovieFilesTab from "./movie-files-tab";

describe("MovieFilesTab", () => {
	it("renders the empty state when no files are available", async () => {
		await renderWithProviders(<MovieFilesTab files={[]} />);

		await expect
			.element(page.getByTestId("empty-state"))
			.toHaveTextContent("No movie files");
		await expect
			.element(page.getByTestId("empty-state"))
			.toHaveTextContent("No files have been imported for this movie yet.");
	});

	it("renders file metadata and formatting helpers for populated file rows", async () => {
		await renderWithProviders(
			<MovieFilesTab
				files={[
					{
						codec: "H.264",
						container: "mkv",
						dateAdded: new Date("2024-05-01T00:00:00Z"),
						duration: 7_200,
						id: 1,
						path: "/movies/Alien (1979).mkv",
						quality: {
							quality: { id: 1, name: "Bluray-1080p" },
							revision: { real: 0, version: 1 },
						},
						size: 3 * 1024 * 1024 * 1024,
					},
					{
						codec: null,
						container: null,
						dateAdded: new Date("2024-05-02T00:00:00Z"),
						duration: null,
						id: 2,
						path: "/movies/Unknown.avi",
						quality: null,
						size: 512 * 1024 * 1024,
					},
				]}
			/>,
		);

		await expect.element(page.getByText("Files (2)")).toBeInTheDocument();
		await expect
			.element(page.getByText("/movies/Alien (1979).mkv"))
			.toBeInTheDocument();
		await expect.element(page.getByText("3.0 GB")).toBeInTheDocument();
		await expect.element(page.getByText("Bluray-1080p")).toBeInTheDocument();
		await expect.element(page.getByText("2h")).toBeInTheDocument();
		await expect.element(page.getByText("512.0 MB")).toBeInTheDocument();
		await expect
			.element(page.getByText("Unknown", { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText("-").first()).toBeInTheDocument();
	});
});
