import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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

vi.mock("src/components/ui/input", () => ({
	default: ({
		id,
		onChange,
		placeholder,
		type = "text",
		value,
	}: {
		id?: string;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		type?: string;
		value?: string;
	}) => (
		<input
			id={id}
			placeholder={placeholder}
			type={type}
			value={value}
			onChange={(event) => onChange?.(event as never)}
		/>
	),
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children, value }: { children: ReactNode; value: string }) => (
		<div data-testid="select" data-value={value}>
			{children}
		</div>
	),
	SelectContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<span>{placeholder ?? ""}</span>
	),
}));

import type { ImportSourceRecord } from "src/lib/queries";
import ImportSourceDialog from "./import-source-dialog";

const source: ImportSourceRecord = {
	baseUrl: "http://localhost:8989",
	createdAt: new Date("2026-04-21T00:00:00.000Z"),
	hasApiKey: true,
	id: 1,
	kind: "sonarr",
	label: "Sonarr Main",
	lastSyncError: null,
	lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
	lastSyncStatus: "synced",
	updatedAt: new Date("2026-04-21T00:00:00.000Z"),
};

describe("ImportSourceDialog", () => {
	it("renders the create form and submits new source values", async () => {
		const onSubmit = vi.fn();

		await renderWithProviders(
			<ImportSourceDialog
				open
				source={null}
				onOpenChange={vi.fn()}
				onSubmit={onSubmit}
			/>,
		);

		await expect
			.element(page.getByRole("heading", { name: "Add Import Source" }))
			.toBeInTheDocument();

		await page.getByLabelText("Label").fill("Radarr Main");
		await page.getByLabelText("Base URL").fill("http://localhost:7878");
		await page.getByLabelText("API Key").fill("secret-key");
		await page.getByRole("button", { name: "Create Source" }).click();

		expect(onSubmit).toHaveBeenCalledWith({
			apiKey: "secret-key",
			baseUrl: "http://localhost:7878",
			kind: "sonarr",
			label: "Radarr Main",
		});
	});

	it("renders the edit form and submits updated source values", async () => {
		const onSubmit = vi.fn();

		await renderWithProviders(
			<ImportSourceDialog
				open
				source={source}
				onOpenChange={vi.fn()}
				onSubmit={onSubmit}
			/>,
		);

		await expect
			.element(page.getByRole("heading", { name: "Edit Sonarr Main" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText(/Re-enter the API key/))
			.toBeInTheDocument();

		await page.getByLabelText("Label").fill("Sonarr Archive");
		await page.getByLabelText("API Key").fill("updated-key");
		await page.getByRole("button", { name: "Save Source" }).click();

		expect(onSubmit).toHaveBeenCalledWith({
			apiKey: "updated-key",
			baseUrl: "http://localhost:8989",
			kind: "sonarr",
			label: "Sonarr Archive",
		});
	});
});
