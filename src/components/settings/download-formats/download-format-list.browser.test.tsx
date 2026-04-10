import type { ComponentProps, PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const downloadFormatListMocks = vi.hoisted(() => ({
	updateDownloadFormat: {
		mutate: vi.fn(),
	},
}));

vi.mock("src/hooks/mutations", () => ({
	useUpdateDownloadFormat: () => downloadFormatListMocks.updateDownloadFormat,
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: PropsWithChildren<{
		description: string;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}>) =>
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

import DownloadFormatList from "./download-format-list";

type DownloadFormatListProps = ComponentProps<typeof DownloadFormatList>;
type DownloadFormat = DownloadFormatListProps["definitions"][number];

const baseDefinition = {
	id: 1,
	title: "Archive",
	weight: 1,
	color: "gray",
	minSize: 0,
	maxSize: 0,
	preferredSize: 10,
	noMaxLimit: 1,
	noPreferredLimit: 0,
	contentTypes: ["ebook"],
	source: null,
	resolution: 0,
} satisfies DownloadFormat;

function makeDefinition(
	overrides: Partial<DownloadFormat> = {},
): DownloadFormat {
	return {
		...baseDefinition,
		...overrides,
		contentTypes: overrides.contentTypes ?? baseDefinition.contentTypes,
	};
}

describe("DownloadFormatList", () => {
	afterEach(() => {
		downloadFormatListMocks.updateDownloadFormat.mutate.mockReset();
	});

	it("shows the empty state when there are no definitions", async () => {
		await renderWithProviders(
			<DownloadFormatList
				definitions={[]}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
			/>,
		);

		await expect
			.element(
				page.getByText("No download formats found. Create one to get started."),
			)
			.toBeInTheDocument();
	});

	it("renders rows, hides example sizes for unknown formats, and wires the actions", async () => {
		const onDelete = vi.fn();
		const onEdit = vi.fn();
		const unknownVideo = makeDefinition({
			id: 11,
			title: "Unknown Video",
			color: "blue",
			contentTypes: ["movie"],
			minSize: 1,
			maxSize: 2,
			preferredSize: 1,
			noMaxLimit: 0,
		});
		const archiveFormat = makeDefinition({
			id: 12,
			title: "Archive",
			color: "green",
			contentTypes: ["ebook"],
			noMaxLimit: 1,
		});

		await renderWithProviders(
			<DownloadFormatList
				definitions={[unknownVideo, archiveFormat]}
				onDelete={onDelete}
				onEdit={onEdit}
			/>,
		);

		const unknownRowEl = (
			await page.getByText("Unknown Video").element()
		).closest("tr");
		expect(unknownRowEl).not.toBeNull();
		expect(unknownRowEl?.querySelector("td")?.textContent).not.toContain(
			"1 hr:",
		);

		const archiveRowEl = (await page.getByText("Archive").element()).closest(
			"tr",
		);
		expect(archiveRowEl).not.toBeNull();

		// "No limit" text appears in the archive row
		expect(archiveRowEl?.textContent).toContain("No limit");

		const archiveButtons = archiveRowEl?.querySelectorAll(
			"[role='button'], button",
		);
		await (archiveButtons?.[0] as HTMLElement).click();
		expect(onEdit).toHaveBeenCalledWith(archiveFormat);

		await (archiveButtons?.[1] as HTMLElement).click();
		await expect
			.element(page.getByTestId("confirm-dialog"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Delete Download Format"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onDelete).toHaveBeenCalledWith(archiveFormat.id);
		await expect
			.element(page.getByText("Delete Download Format"))
			.not.toBeInTheDocument();
	});
});
