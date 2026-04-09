import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	TooltipContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	TooltipProvider: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

vi.mock("src/components/ui/popover", () => ({
	Popover: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	PopoverContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

vi.mock("src/components/ui/skeleton", () => ({
	default: ({ className }: { className?: string }) => (
		<div className={className} data-testid="skeleton" />
	),
}));

import ReleaseTable from "./release-table";

const defaultRelease = {
	allstarrIndexerId: 11,
	age: 2,
	ageFormatted: "2d",
	cfDetails: [],
	cfScore: 0,
	downloadUrl: "https://example.com/default",
	formatScore: 10,
	formatScoreDetails: [],
	guid: "default-guid",
	grabs: 0,
	indexer: "Indexer A",
	indexerFlags: null,
	indexerId: 101,
	indexerSource: "synced" as const,
	leechers: 3,
	packInfo: null,
	peers: 3,
	protocol: "torrent" as const,
	quality: { color: "green", id: 1, name: "Preferred", weight: 100 },
	rating: undefined,
	releaseType: 10,
	rejections: [],
	seeders: 10,
	size: 1024,
	sizeFormatted: "1 KB",
	title: "Zulu",
} as const;

describe("ReleaseTable", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("shows loading and empty states", () => {
		const { getAllByTestId, getByText, rerender } = renderWithProviders(
			<ReleaseTable
				grabbingGuid={undefined}
				loading
				onGrab={vi.fn()}
				releases={[]}
				statusMap={null}
			/>,
		);

		expect(getAllByTestId("skeleton")).toHaveLength(7);

		rerender(
			<ReleaseTable
				grabbingGuid={undefined}
				onGrab={vi.fn()}
				releases={[]}
				statusMap={null}
			/>,
		);

		expect(getByText("No releases found.")).toBeInTheDocument();
	});

	it("renders release rows, sorts them, and exposes the grab/status branches", async () => {
		const user = userEvent.setup();
		const onGrab = vi.fn();
		const releases = [
			{
				...defaultRelease,
				guid: "zulu-guid",
				title: "Zulu",
				quality: { color: "green", id: 1, name: "Preferred", weight: 100 },
			},
			{
				...defaultRelease,
				formatScore: 42,
				formatScoreDetails: [
					{ allowed: true, profileName: "Ebook", score: 8 },
					{ allowed: false, profileName: "Audio", score: -4 },
				],
				guid: "alpha-guid",
				quality: { color: "blue", id: 2, name: "Secondary", weight: 20 },
				rejections: [
					{
						message: "Too small",
						reason: "belowMinimumSize",
					},
				],
				title: "Alpha",
			},
			{
				...defaultRelease,
				guid: "beta-guid",
				quality: { color: "amber", id: 3, name: "Queue", weight: 60 },
				title: "Beta",
			},
			{
				...defaultRelease,
				guid: "gamma-guid",
				quality: { color: "gray", id: 4, name: "Stored", weight: 10 },
				title: "Gamma",
			},
		];

		const { getByRole, getByText, getAllByRole } = renderWithProviders(
			<ReleaseTable
				grabbingGuid={undefined}
				onGrab={onGrab}
				releases={releases as never}
				statusMap={{
					existingQualityIds: [4],
					grabbedGuids: ["alpha-guid", "beta-guid"],
					queueTitles: ["Beta"],
				}}
			/>,
		);

		expect(getByText("Zulu")).toBeInTheDocument();
		expect(getByText("Alpha")).toBeInTheDocument();
		expect(getByText("Beta")).toBeInTheDocument();
		expect(getByText("Gamma")).toBeInTheDocument();
		expect(getByText("Ebook")).toBeInTheDocument();
		expect(getByText("Audio")).toBeInTheDocument();
		expect(getByText("Too small")).toBeInTheDocument();
		expect(getByText("Downloading")).toBeInTheDocument();
		expect(getByText("Already on disk")).toBeInTheDocument();
		expect(getByTitle("Previously sent to client")).toBeInTheDocument();
		expect(getByTitle("Grab release")).toBeInTheDocument();

		await user.click(getByTitle("Grab release"));
		expect(onGrab).toHaveBeenCalledWith(
			expect.objectContaining({ guid: "zulu-guid" }),
		);

		await user.click(getByText("Title"));
		expect(getAllByRole("rowheader")[0]).toHaveTextContent("Alpha");
	});

	it("shows a disabled grab control while a release is already being grabbed", () => {
		const { getByRole } = renderWithProviders(
			<ReleaseTable
				grabbingGuid="zulu-guid"
				onGrab={vi.fn()}
				releases={[defaultRelease]}
				statusMap={null}
			/>,
		);

		expect(getByRole("button")).toBeDisabled();
	});
});
