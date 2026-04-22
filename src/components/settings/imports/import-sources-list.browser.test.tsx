import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		loading,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		description: string;
		loading?: boolean;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<h2>{title}</h2>
				<p>{description}</p>
				<div data-testid="confirm-loading">{String(Boolean(loading))}</div>
				<button onClick={onConfirm} type="button">
					Confirm
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Cancel
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({
		action,
		description,
		title,
	}: {
		action?: ReactNode;
		description: string;
		title: string;
	}) => (
		<div data-testid="empty-state">
			<h3>{title}</h3>
			<p>{description}</p>
			{action}
		</div>
	),
}));

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
import ImportSourcesList from "./import-sources-list";

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

describe("ImportSourcesList", () => {
	it("renders the empty state and add action when no sources exist", async () => {
		const onAddSource = vi.fn();

		await renderWithProviders(
			<ImportSourcesList
				deletingSourceId={null}
				onAddSource={onAddSource}
				onDeleteSource={vi.fn()}
				onEditSource={vi.fn()}
				onRefreshSource={vi.fn()}
				onSelectSource={vi.fn()}
				refreshingSourceId={null}
				selectedSourceId={null}
				sources={[]}
			/>,
		);

		await expect.element(page.getByTestId("empty-state")).toBeInTheDocument();
		await page.getByRole("button", { name: "Add source" }).click();
		expect(onAddSource).toHaveBeenCalledTimes(1);
	});

	it("renders sources, wires actions, and confirms deletes", async () => {
		const onAddSource = vi.fn();
		const onDeleteSource = vi.fn();
		const onEditSource = vi.fn();
		const onRefreshSource = vi.fn();
		const onSelectSource = vi.fn();

		await renderWithProviders(
			<ImportSourcesList
				deletingSourceId={null}
				onAddSource={onAddSource}
				onDeleteSource={onDeleteSource}
				onEditSource={onEditSource}
				onRefreshSource={onRefreshSource}
				onSelectSource={onSelectSource}
				refreshingSourceId={null}
				selectedSourceId={1}
				sources={sources}
			/>,
		);

		await expect
			.element(page.getByText("Sonarr • http://localhost:8989"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Radarr • http://localhost:7878"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Selected" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Source API error: 401 Unauthorized"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Refresh" }).first().click();
		expect(onRefreshSource).toHaveBeenCalledWith(1);

		await page.getByRole("button", { name: "Edit" }).first().click();
		expect(onEditSource).toHaveBeenCalledWith(
			expect.objectContaining({ id: 1, label: "Sonarr" }),
		);

		await page.getByRole("button", { name: "Select" }).last().click();
		expect(onSelectSource).toHaveBeenCalledWith(2);

		await page.getByRole("button", { name: "Delete" }).last().click();
		await expect
			.element(page.getByRole("heading", { name: "Delete Import Source" }))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Confirm" }).click();
		expect(onDeleteSource).toHaveBeenCalledWith(2);
		expect(onAddSource).not.toHaveBeenCalled();
	});
});
