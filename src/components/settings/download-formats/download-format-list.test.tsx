import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

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

	it("shows the empty state when there are no definitions", () => {
		const { getByText } = renderWithProviders(
			<DownloadFormatList
				definitions={[]}
				onDelete={vi.fn()}
				onEdit={vi.fn()}
			/>,
		);

		expect(
			getByText("No download formats found. Create one to get started."),
		).toBeInTheDocument();
	});

	it("renders rows, hides example sizes for unknown formats, and wires the actions", async () => {
		const user = userEvent.setup();
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

		const { getByRole, getByTestId, getByText, queryByText } =
			renderWithProviders(
				<DownloadFormatList
					definitions={[unknownVideo, archiveFormat]}
					onDelete={onDelete}
					onEdit={onEdit}
				/>,
			);

		const unknownRow = getByText("Unknown Video").closest("tr");
		expect(unknownRow).not.toBeNull();
		expect(
			within(unknownRow as HTMLTableRowElement).queryByText("1 hr:"),
		).not.toBeInTheDocument();

		const archiveRow = getByText("Archive").closest("tr");
		expect(archiveRow).not.toBeNull();
		const archiveRowScope = within(archiveRow as HTMLTableRowElement);

		expect(archiveRowScope.getByText("No limit")).toBeInTheDocument();

		await user.click(archiveRowScope.getAllByRole("button")[0]);
		expect(onEdit).toHaveBeenCalledWith(archiveFormat);

		await user.click(archiveRowScope.getAllByRole("button")[1]);
		expect(getByTestId("confirm-dialog")).toBeInTheDocument();
		expect(getByText("Delete Download Format")).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onDelete).toHaveBeenCalledWith(archiveFormat.id);
		expect(queryByText("Delete Download Format")).not.toBeInTheDocument();
	});
});
