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

import CustomFormatList from "./custom-format-list";

const customFormats = [
	{
		category: "Video Codec",
		contentTypes: ["movie"],
		defaultScore: 1_500,
		description: "Built-in movie codec format",
		id: 1,
		name: "Movie Codec",
		origin: "builtin",
	},
	{
		category: "File Format",
		contentTypes: ["ebook"],
		defaultScore: 100,
		description: null,
		id: 2,
		name: "Ebook Pack",
		origin: "imported",
	},
	{
		category: "HDR",
		contentTypes: ["movie", "tv"],
		defaultScore: -200,
		description: null,
		id: 3,
		name: "Gamma Boost",
		origin: null,
	},
];

describe("CustomFormatList", () => {
	it("shows the empty state when no formats exist", async () => {
		await renderWithProviders(
			<CustomFormatList
				customFormats={[]}
				onDelete={vi.fn()}
				onDuplicate={vi.fn()}
				onEdit={vi.fn()}
			/>,
		);

		await expect
			.element(
				page.getByText("No custom formats found. Create one to get started."),
			)
			.toBeInTheDocument();
	});

	it("filters, sorts through the list actions, and confirms deletes", async () => {
		const onDelete = vi.fn();
		const onDuplicate = vi.fn();
		const onEdit = vi.fn();

		await renderWithProviders(
			<CustomFormatList
				customFormats={customFormats as never}
				onDelete={onDelete}
				onDuplicate={onDuplicate}
				onEdit={onEdit}
			/>,
		);

		await page.getByRole("tab", { name: "Ebook" }).click();
		await expect.element(page.getByText("Ebook Pack")).toBeInTheDocument();
		await expect.element(page.getByText("Movie Codec")).not.toBeInTheDocument();

		await page.getByRole("tab", { name: "All" }).click();
		await page.getByPlaceholder("Search custom formats...").fill("ga");

		const rowEl = (await page.getByText("Gamma Boost").element()).closest("tr");
		expect(rowEl).not.toBeNull();
		if (!rowEl) throw new Error("Expected Gamma Boost row to render");

		const buttons = rowEl.querySelectorAll("button");
		await buttons[0].click();
		await buttons[1].click();

		expect(onEdit).toHaveBeenCalledWith(
			expect.objectContaining({ id: 3, name: "Gamma Boost" }),
		);
		expect(onDuplicate).toHaveBeenCalledWith(3);

		await buttons[2].click();
		await expect
			.element(page.getByRole("heading", { name: "Delete Custom Format" }))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					'Are you sure you want to delete "Gamma Boost"? This action cannot be undone.',
				),
			)
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onDelete).toHaveBeenCalledWith(3);
	});
});
