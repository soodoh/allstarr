import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		description: string;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<h2>{title}</h2>
				<p>{description}</p>
				<button onClick={onConfirm} type="button">
					Confirm
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Cancel
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
		variant,
	}: {
		children: ReactNode;
		className?: string;
		variant?: string;
	}) => (
		<span className={className} data-variant={variant}>
			{children}
		</span>
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
		type?: "button" | "submit" | "reset";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/table", () => ({
	Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
	TableBody: ({ children }: { children: ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
	TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
	TableHeader: ({ children }: { children: ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));

import DownloadClientList from "./download-client-list";

const baseClient = {
	apiKey: null,
	category: "allstarr",
	createdAt: 1,
	enabled: true,
	host: "localhost",
	id: 1,
	implementation: "qBittorrent",
	name: "qBittorrent",
	password: null,
	port: 8080,
	priority: 1,
	protocol: "torrent",
	removeCompletedDownloads: true,
	settings: null,
	tag: null,
	updatedAt: 1,
	urlBase: null,
	useSsl: false,
	username: "admin",
};

describe("DownloadClientList", () => {
	it("renders an empty state when no clients are configured", async () => {
		await renderWithProviders(
			<DownloadClientList clients={[]} onDelete={vi.fn()} onEdit={vi.fn()} />,
		);

		await expect
			.element(
				page.getByText(
					"No download clients configured. Add one to get started.",
				),
			)
			.toBeInTheDocument();
	});

	it("renders configured clients and confirms deletes through the dialog", async () => {
		const onDelete = vi.fn();
		const onEdit = vi.fn();
		const clients = [
			baseClient,
			{
				...baseClient,
				enabled: false,
				host: "usenet.local",
				id: 2,
				implementation: "SABnzbd",
				name: "SABnzbd",
				port: 8081,
				protocol: "usenet",
				username: null,
			},
		];

		await renderWithProviders(
			<DownloadClientList
				clients={clients as never}
				onDelete={onDelete}
				onEdit={onEdit}
			/>,
		);

		await expect.element(page.getByText("localhost:8080")).toBeInTheDocument();
		await expect
			.element(page.getByText("usenet.local:8081"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Enabled")).toBeInTheDocument();
		await expect.element(page.getByText("Disabled")).toBeInTheDocument();

		// Get rows by finding the text and traversing to the table row
		const qBitText = await page
			.getByRole("cell", { name: "qBittorrent" })
			.first()
			.element();
		const firstRow = qBitText.closest("tr") as HTMLTableRowElement;
		const sabnzbdText = await page
			.getByRole("cell", { name: "SABnzbd" })
			.first()
			.element();
		const secondRow = sabnzbdText.closest("tr") as HTMLTableRowElement;

		expect(firstRow).not.toBeNull();
		expect(secondRow).not.toBeNull();

		const firstRowButtons = firstRow.querySelectorAll("button");
		await firstRowButtons[0].click();
		expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

		const secondRowButtons = secondRow.querySelectorAll("button");
		await secondRowButtons[1].click();
		await expect
			.element(page.getByRole("heading", { name: "Delete Download Client" }))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					'Are you sure you want to delete "SABnzbd"? This action cannot be undone.',
				),
			)
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onDelete).toHaveBeenCalledWith(2);
	});
});
