import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children, variant }: { children: ReactNode; variant?: string }) => (
		<span data-variant={variant ?? "default"}>{children}</span>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type = "button",
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type}>
			{children}
		</button>
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

import type { ImportSourceRecord } from "src/lib/queries";
import ImportReviewPanel from "./import-review-panel";

const sources: ImportSourceRecord[] = [
	{
		baseUrl: "http://localhost:8989",
		createdAt: new Date("2026-04-20T00:00:00.000Z"),
		hasApiKey: true,
		id: 1,
		kind: "sonarr",
		label: "Sonarr",
		lastSyncError: null,
		lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
		lastSyncStatus: "synced",
		updatedAt: new Date("2026-04-21T00:00:00.000Z"),
	},
	{
		baseUrl: "http://localhost:7878",
		createdAt: new Date("2026-04-20T00:00:00.000Z"),
		hasApiKey: false,
		id: 2,
		kind: "radarr",
		label: "Radarr",
		lastSyncError: "Source API error: 401 Unauthorized",
		lastSyncedAt: null,
		lastSyncStatus: "error",
		updatedAt: new Date("2026-04-21T00:00:00.000Z"),
	},
];

describe("ImportReviewPanel", () => {
	it("renders conservative recommendations and disables unresolved rows", async () => {
		const onSelectSource = vi.fn();

		await renderWithProviders(
			<ImportReviewPanel
				onSelectSource={onSelectSource}
				selectedSourceId={1}
				sources={sources}
			/>,
		);

		await expect.element(page.getByText("Ready 1")).toBeInTheDocument();
		await expect
			.element(page.getByText("Needs attention 1"))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					"Review the latest snapshot and confirm the source is still aligned.",
				),
			)
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Fix the sync error before any review action."))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Current" }).click();
		expect(onSelectSource).toHaveBeenCalledWith(1);

		await expect
			.element(page.getByRole("button", { name: "Unavailable" }))
			.toBeDisabled();
	});
});
