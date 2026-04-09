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
	it("shows the empty state when no formats exist", () => {
		const { getByText } = renderWithProviders(
			<CustomFormatList
				customFormats={[]}
				onDelete={vi.fn()}
				onDuplicate={vi.fn()}
				onEdit={vi.fn()}
			/>,
		);

		expect(
			getByText("No custom formats found. Create one to get started."),
		).toBeInTheDocument();
	});

	it("filters, sorts through the list actions, and confirms deletes", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn();
		const onDuplicate = vi.fn();
		const onEdit = vi.fn();

		const { getByPlaceholderText, getByRole, getByText, queryByText } =
			renderWithProviders(
				<CustomFormatList
					customFormats={customFormats as never}
					onDelete={onDelete}
					onDuplicate={onDuplicate}
					onEdit={onEdit}
				/>,
			);

		await user.click(getByRole("tab", { name: "Ebook" }));
		expect(getByText("Ebook Pack")).toBeInTheDocument();
		expect(queryByText("Movie Codec")).not.toBeInTheDocument();

		await user.click(getByRole("tab", { name: "All" }));
		await user.type(getByPlaceholderText("Search custom formats..."), "ga");

		const row = getByText("Gamma Boost").closest("tr");
		expect(row).not.toBeNull();
		if (!row) {
			throw new Error("Expected Gamma Boost row to render");
		}

		const rowScope = within(row);
		await user.click(rowScope.getAllByRole("button")[0]);
		await user.click(rowScope.getAllByRole("button")[1]);

		expect(onEdit).toHaveBeenCalledWith(
			expect.objectContaining({ id: 3, name: "Gamma Boost" }),
		);
		expect(onDuplicate).toHaveBeenCalledWith(3);

		await user.click(rowScope.getAllByRole("button")[2]);
		expect(
			getByRole("heading", { name: "Delete Custom Format" }),
		).toBeInTheDocument();
		expect(
			getByText(
				'Are you sure you want to delete "Gamma Boost"? This action cannot be undone.',
			),
		).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onDelete).toHaveBeenCalledWith(3);
	});
});
