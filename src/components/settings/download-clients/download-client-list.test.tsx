import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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
	it("renders an empty state when no clients are configured", () => {
		const { getByText } = renderWithProviders(
			<DownloadClientList clients={[]} onDelete={vi.fn()} onEdit={vi.fn()} />,
		);

		expect(
			getByText("No download clients configured. Add one to get started."),
		).toBeInTheDocument();
	});

	it("renders configured clients and confirms deletes through the dialog", async () => {
		const user = userEvent.setup();
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

		const { getAllByText, getByRole, getByText } = renderWithProviders(
			<DownloadClientList
				clients={clients as never}
				onDelete={onDelete}
				onEdit={onEdit}
			/>,
		);

		expect(getByText("localhost:8080")).toBeInTheDocument();
		expect(getByText("usenet.local:8081")).toBeInTheDocument();
		expect(getByText("Enabled")).toBeInTheDocument();
		expect(getByText("Disabled")).toBeInTheDocument();

		const firstRow = getAllByText("qBittorrent")[0].closest("tr");
		const secondRow = getAllByText("SABnzbd")[0].closest("tr");

		expect(firstRow).not.toBeNull();
		expect(secondRow).not.toBeNull();
		if (!firstRow || !secondRow) {
			throw new Error("Expected table rows to exist");
		}

		await user.click(within(firstRow).getAllByRole("button")[0]);
		expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

		await user.click(within(secondRow).getAllByRole("button")[1]);
		expect(
			getByRole("heading", { name: "Delete Download Client" }),
		).toBeInTheDocument();
		expect(
			getByText(
				'Are you sure you want to delete "SABnzbd"? This action cannot be undone.',
			),
		).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onDelete).toHaveBeenCalledWith(2);
	});
});
