import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { CATEGORY_MAP } from "src/lib/categories";
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
				<button onClick={() => onOpenChange(false)} type="button">
					Cancel
				</button>
				<button onClick={onConfirm} type="button">
					Confirm
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	TooltipProvider: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import DownloadProfileList from "./download-profile-list";

const definitions = [
	{ color: "green", id: 1, title: "EPUB" },
	{ color: "blue", id: 2, title: "PDF" },
	{ color: "amber", id: 3, title: "MOBI" },
];

const profile = {
	categories: [1000, 2000],
	contentType: "tv",
	cutoff: 2,
	icon: "book",
	id: 11,
	items: [[1, 2], [3]],
	name: "Library Profile",
	rootFolderPath: "",
	upgradeAllowed: true,
};

describe("DownloadProfileList", () => {
	it("shows the empty state when there are no profiles", () => {
		const { getByText } = renderWithProviders(
			<DownloadProfileList
				definitions={definitions}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				profiles={[]}
			/>,
		);

		expect(
			getByText("No download profiles found. Create one to get started."),
		).toBeInTheDocument();
	});

	it("renders profile rows and wires edit/delete actions", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn();
		const onEdit = vi.fn();
		const { getByRole, getByText } = renderWithProviders(
			<DownloadProfileList
				definitions={definitions}
				onDelete={onDelete}
				onEdit={onEdit}
				profiles={[profile]}
			/>,
		);

		const row = getByText("Library Profile").closest("tr");
		expect(row).not.toBeNull();
		const rowScope = within(row as HTMLTableRowElement);

		expect(rowScope.getByText("TV")).toBeInTheDocument();
		expect(rowScope.getByText("—")).toBeInTheDocument();
		expect(rowScope.getByText("Until PDF")).toBeInTheDocument();
		expect(rowScope.getByText("EPUB")).toBeInTheDocument();
		expect(rowScope.getByText("PDF")).toBeInTheDocument();
		expect(rowScope.getByText("MOBI")).toBeInTheDocument();
		expect(
			rowScope.getByText(CATEGORY_MAP.get(1000) ?? "1000"),
		).toBeInTheDocument();
		expect(
			rowScope.getByText(CATEGORY_MAP.get(2000) ?? "2000"),
		).toBeInTheDocument();

		await user.click(rowScope.getAllByRole("button")[0]);
		expect(onEdit).toHaveBeenCalledWith(profile);

		await user.click(rowScope.getAllByRole("button")[1]);
		expect(getByText("Delete Profile")).toBeInTheDocument();
		expect(
			getByText(
				'Are you sure you want to delete "Library Profile"? This action cannot be undone.',
			),
		).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onDelete).toHaveBeenCalledWith(profile.id);
	});
});
