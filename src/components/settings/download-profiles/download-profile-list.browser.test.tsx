import type { ReactNode } from "react";
import { CATEGORY_MAP } from "src/lib/categories";
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
	it("shows the empty state when there are no profiles", async () => {
		await renderWithProviders(
			<DownloadProfileList
				definitions={definitions}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
				profiles={[]}
			/>,
		);

		await expect
			.element(
				page.getByText(
					"No download profiles found. Create one to get started.",
				),
			)
			.toBeInTheDocument();
	});

	it("renders profile variants, fallbacks, and cancelable deletion", async () => {
		const onDelete = vi.fn();
		await renderWithProviders(
			<DownloadProfileList
				definitions={definitions}
				onDelete={onDelete}
				onEdit={vi.fn()}
				profiles={[
					{
						...profile,
						contentType: "movie",
						cutoff: 0,
						id: 12,
						items: [[999], [1]],
						name: "Movie Profile",
						rootFolderPath: "/movies",
						upgradeAllowed: true,
					},
					{
						...profile,
						categories: [9999],
						contentType: "ebook",
						id: 13,
						name: "Ebook Profile",
						upgradeAllowed: false,
					},
					{
						...profile,
						contentType: "audiobook",
						id: 14,
						name: "Audio Profile",
					},
					{
						...profile,
						contentType: "podcast",
						id: 15,
						name: "Podcast Profile",
					},
				]}
			/>,
		);

		const movieRow = (await page.getByText("Movie Profile").element()).closest(
			"tr",
		);
		const ebookRow = (await page.getByText("Ebook Profile").element()).closest(
			"tr",
		);
		const audioRow = (await page.getByText("Audio Profile").element()).closest(
			"tr",
		);
		const podcastRow = (
			await page.getByText("Podcast Profile").element()
		).closest("tr");
		expect(movieRow?.textContent).toContain("Movie");
		expect(movieRow?.textContent).toContain("/movies");
		expect(movieRow?.textContent).toContain("Yes");
		expect(ebookRow?.textContent).toContain("Ebook");
		expect(ebookRow?.textContent).toContain("No");
		expect(ebookRow?.textContent).toContain("9999");
		expect(audioRow?.textContent).toContain("Audiobook");
		expect(podcastRow?.textContent).toContain("podcast");
		const rowButtons = movieRow?.querySelectorAll("[role='button'], button");
		const deleteButton = rowButtons?.item(1);
		if (!deleteButton) {
			throw new Error("Delete button not found");
		}
		await page.elementLocator(deleteButton).click();
		await expect.element(page.getByText("Delete Profile")).toBeInTheDocument();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect
			.element(page.getByText("Delete Profile"))
			.not.toBeInTheDocument();
		expect(onDelete).not.toHaveBeenCalled();
	});

	it("renders profile rows and wires edit/delete actions", async () => {
		const onDelete = vi.fn();
		const onEdit = vi.fn();
		await renderWithProviders(
			<DownloadProfileList
				definitions={definitions}
				onDelete={onDelete}
				onEdit={onEdit}
				profiles={[profile]}
			/>,
		);

		const row = (await page.getByText("Library Profile").element()).closest(
			"tr",
		);
		expect(row).not.toBeNull();

		expect(row?.textContent).toContain("TV");
		expect(row?.textContent).toContain("—");
		expect(row?.textContent).toContain("Until PDF");
		expect(row?.textContent).toContain("EPUB");
		expect(row?.textContent).toContain("PDF");
		expect(row?.textContent).toContain("MOBI");
		expect(row?.textContent).toContain(CATEGORY_MAP.get(1000) ?? "1000");
		expect(row?.textContent).toContain(CATEGORY_MAP.get(2000) ?? "2000");

		const rowButtons = row?.querySelectorAll("[role='button'], button");
		await (rowButtons?.[0] as HTMLElement).click();
		expect(onEdit).toHaveBeenCalledWith(profile);

		await (rowButtons?.[1] as HTMLElement).click();
		await expect.element(page.getByText("Delete Profile")).toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					'Are you sure you want to delete "Library Profile"? This action cannot be undone.',
				),
			)
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onDelete).toHaveBeenCalledWith(profile.id);
	});
});
