import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const { updateSeriesState } = vi.hoisted(() => ({
	updateSeriesState: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div>{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/shared/profile-checkbox-group", () => ({
	default: ({
		onToggle,
		selectedIds,
	}: {
		onToggle: (id: number) => void;
		selectedIds: number[];
	}) => (
		<div>
			<p>Selected: {selectedIds.join(",")}</p>
			<button type="button" onClick={() => onToggle(1)}>
				Toggle profile 1
			</button>
			<button type="button" onClick={() => onToggle(2)}>
				Toggle profile 2
			</button>
		</div>
	),
}));

vi.mock("src/hooks/mutations/series", () => ({
	useUpdateSeries: () => updateSeriesState,
}));

import EditSeriesProfilesDialog from "./edit-series-profiles-dialog";

describe("EditSeriesProfilesDialog", () => {
	afterEach(() => {
		updateSeriesState.isPending = false;
		updateSeriesState.mutate.mockReset();
	});

	it("does not render when closed", async () => {
		renderWithProviders(
			<EditSeriesProfilesDialog
				downloadProfileIds={[2]}
				onOpenChange={vi.fn()}
				open={false}
				profiles={[]}
				seriesId={7}
				seriesTitle="Dune Saga"
			/>,
		);

		await expect
			.element(page.getByText("Edit Profiles for Dune Saga"))
			.not.toBeInTheDocument();
	});

	it("toggles selected ids and saves them through the mutation", async () => {
		const onOpenChange = vi.fn();
		updateSeriesState.mutate.mockImplementation(
			(
				_data: { downloadProfileIds: number[]; id: number },
				options?: { onSuccess?: () => void },
			) => options?.onSuccess?.(),
		);

		renderWithProviders(
			<EditSeriesProfilesDialog
				downloadProfileIds={[2]}
				onOpenChange={onOpenChange}
				open
				profiles={[
					{ icon: "monitor", id: 1, name: "HD" },
					{ icon: "audioLines", id: 2, name: "Audio" },
				]}
				seriesId={7}
				seriesTitle="Dune Saga"
			/>,
		);

		await expect.element(page.getByText("Selected: 2")).toBeInTheDocument();

		await page.getByRole("button", { name: "Toggle profile 1" }).click();
		await page.getByRole("button", { name: "Toggle profile 2" }).click();
		await page.getByRole("button", { name: "Save" }).click();

		expect(updateSeriesState.mutate).toHaveBeenCalledWith(
			{ downloadProfileIds: [1], id: 7 },
			expect.any(Object),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("disables save while the mutation is pending and still allows cancel", async () => {
		const onOpenChange = vi.fn();
		updateSeriesState.isPending = true;

		renderWithProviders(
			<EditSeriesProfilesDialog
				downloadProfileIds={[2]}
				onOpenChange={onOpenChange}
				open
				profiles={[]}
				seriesId={7}
				seriesTitle="Dune Saga"
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Save" }))
			.toBeDisabled();

		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
