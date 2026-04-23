import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children, variant }: { children: ReactNode; variant?: string }) => (
		<span data-variant={variant ?? "default"}>{children}</span>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	CardHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("lucide-react", () => ({
	AlertTriangle: () => <span>AlertTriangle</span>,
	CircleAlert: () => <span>CircleAlert</span>,
	CircleCheck: () => <span>CircleCheck</span>,
}));

import ImportReviewPanel from "./import-review-panel";

const rows = [
	{
		action: "unresolved",
		payload: { authorName: "Unknown Author" },
		reason: "No confident Hardcover match",
		resourceType: "book",
		sourceKey: "readarr:2:book:501",
		sourceSummary: "Author Unknown Author",
		status: "unresolved" as const,
		target: { id: null, label: null },
		title: "Unknown Book",
	},
	{
		action: "skip",
		payload: { tmdbId: 11 },
		reason: "Already imported from this source",
		resourceType: "movie",
		sourceKey: "radarr:8:movie:111",
		sourceSummary: "TMDB 11",
		status: "blocked" as const,
		target: { id: 21, label: "Dune" },
		title: "Dune",
	},
];

describe("ImportReviewPanel", () => {
	it("renders unresolved and blocked review rows", async () => {
		await renderWithProviders(<ImportReviewPanel rows={rows} />);

		await expect.element(page.getByText("Ready 0")).toBeInTheDocument();
		await expect
			.element(page.getByText("Needs attention 2"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Unknown Book")).toBeInTheDocument();
		await expect
			.element(page.getByText("No confident Hardcover match"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Author Unknown Author"))
			.toBeInTheDocument();
		await expect.element(page.getByText(/^Dune$/)).toBeInTheDocument();
		await expect
			.element(page.getByText("Already imported from this source"))
			.toBeInTheDocument();
	});
});
