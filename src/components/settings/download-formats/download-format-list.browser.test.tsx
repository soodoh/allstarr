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

vi.mock("src/components/ui/slider", () => ({
	default: ({
		disabledThumbs,
		onValueChange,
		onValueCommit,
		value,
	}: {
		disabledThumbs: Set<number>;
		onValueChange: (value: number[]) => void;
		onValueCommit: (value: number[]) => void;
		value: number[];
	}) => (
		<button
			type="button"
			data-testid="size-slider"
			onClick={() => {
				onValueChange([value[0] + 1, value[1] + 2, value[2] + 3]);
				onValueCommit([value[0] + 1, value[1] + 2, value[2] + 3]);
			}}
		>
			thumbs:{[...disabledThumbs].join(",")}
		</button>
	),
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

	it("updates size limits for audio and video modes while respecting no-limit thumbs", async () => {
		const audio = makeDefinition({
			id: 21,
			title: "MP3",
			contentTypes: ["audiobook"],
			minSize: 64,
			preferredSize: 128,
			maxSize: 320,
			noMaxLimit: 0,
			noPreferredLimit: 1,
		});
		const video = makeDefinition({
			id: 22,
			title: "WEBRip",
			contentTypes: ["tv"],
			minSize: 10,
			preferredSize: 20,
			maxSize: 30,
			noMaxLimit: 0,
			noPreferredLimit: 0,
		});

		await renderWithProviders(
			<DownloadFormatList
				definitions={[audio, video]}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
			/>,
		);

		await expect.element(page.getByText("5 hr:")).toBeInTheDocument();
		await expect.element(page.getByText("1 hr:")).toBeInTheDocument();
		await expect.element(page.getByText("thumbs:1")).toBeInTheDocument();

		await page.getByTestId("size-slider").first().click();
		expect(
			downloadFormatListMocks.updateDownloadFormat.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 21,
				minSize: 65,
				preferredSize: 128,
				maxSize: 323,
			}),
		);

		await page.getByTestId("size-slider").last().click();
		expect(
			downloadFormatListMocks.updateDownloadFormat.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 22,
				minSize: 11,
				preferredSize: 22,
				maxSize: 33,
			}),
		);
	});

	it("renders rows, hides example sizes for unknown formats, and wires the actions", async () => {
		const onDelete = vi.fn();
		const onEdit = vi.fn();
		const unknownVideo = makeDefinition({
			id: 11,
			title: "Unknown Video",
			color: "mystery",
			contentTypes: ["comic"],
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
		expect(unknownRowEl?.textContent).toContain("comic");

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

		await page.getByRole("button", { name: "Cancel" }).click();
		expect(onDelete).not.toHaveBeenCalled();
		await expect
			.element(page.getByText("Delete Download Format"))
			.not.toBeInTheDocument();

		await (archiveButtons?.[1] as HTMLElement).click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onDelete).toHaveBeenCalledWith(archiveFormat.id);
		await expect
			.element(page.getByText("Delete Download Format"))
			.not.toBeInTheDocument();
	});

	it("uses default size and payload values when optional format limits are absent", async () => {
		const custom = {
			...makeDefinition({
				id: 41,
				title: "Custom Range",
				contentTypes: ["ebook"],
				minSize: 5,
				maxSize: undefined,
				preferredSize: undefined,
				noMaxLimit: 1,
				noPreferredLimit: undefined,
			}),
			source: undefined,
			resolution: undefined,
		} as DownloadFormat;

		await renderWithProviders(
			<DownloadFormatList
				definitions={[custom]}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
			/>,
		);

		await expect.element(page.getByText("∞ MB")).toBeInTheDocument();
		await expect.element(page.getByText("200 pg:")).toBeInTheDocument();
		await page.getByTestId("size-slider").click();

		expect(
			downloadFormatListMocks.updateDownloadFormat.mutate,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 41,
				minSize: 6,
				preferredSize: 102,
				maxSize: 100,
				noMaxLimit: 1,
				noPreferredLimit: 0,
				resolution: 0,
				source: null,
			}),
		);
	});

	it("sorts by title, content type, and size limit with no-limit formats last", async () => {
		await renderWithProviders(
			<DownloadFormatList
				definitions={[
					makeDefinition({
						id: 31,
						title: "Zulu",
						contentTypes: ["movie"],
						maxSize: 10,
						noMaxLimit: 0,
					}),
					makeDefinition({
						id: 32,
						title: "Alpha",
						contentTypes: ["ebook"],
						maxSize: 0,
						noMaxLimit: 1,
					}),
					makeDefinition({
						id: 33,
						title: "Middle",
						contentTypes: ["audiobook"],
						maxSize: 5,
						noMaxLimit: 0,
					}),
				]}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
			/>,
		);

		const readRowTitles = () =>
			[...document.querySelectorAll("tbody tr")].map(
				(row) => row.querySelector("td")?.textContent ?? "",
			);

		await page.getByText("Title").click();
		expect(readRowTitles()[0]).toContain("Alpha");

		await page.getByText("Content Type").click();
		expect(readRowTitles()[0]).toContain("Middle");

		await page.getByText("Size Limit").click();
		const sizeSortedTitles = readRowTitles();
		expect(sizeSortedTitles[0]).toContain("Middle");
		expect(sizeSortedTitles[1]).toContain("Zulu");
		expect(sizeSortedTitles[2]).toContain("Alpha");
	});
});
