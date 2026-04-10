import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const removeDownloadDialogMocks = vi.hoisted(() => ({
	isPending: false,
	mutate: vi.fn(),
}));

vi.mock("src/hooks/mutations", () => ({
	useRemoveFromQueue: () => ({
		isPending: removeDownloadDialogMocks.isPending,
		mutate: removeDownloadDialogMocks.mutate,
	}),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		onOpenChange,
		open,
	}: PropsWithChildren<{
		onOpenChange: (open: boolean) => void;
		open: boolean;
	}>) => (
		<div data-open={String(open)}>
			<button onClick={() => onOpenChange(true)} type="button">
				Keep dialog open
			</button>
			{children}
		</div>
	),
	DialogBody: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogDescription: ({ children }: PropsWithChildren) => <p>{children}</p>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked: boolean;
		id: string;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			id={id}
			onChange={(event) => onCheckedChange(event.target.checked)}
			type="checkbox"
		/>
	),
}));

import RemoveDownloadDialog from "./remove-download-dialog";

describe("RemoveDownloadDialog", () => {
	afterEach(() => {
		vi.clearAllMocks();
		removeDownloadDialogMocks.isPending = false;
	});

	const item = {
		downloadClientId: 12,
		id: "dl-123",
		name: "Ubuntu ISO",
		protocol: "torrent",
	};

	it("opens for an item and resets option state when cancelled", async () => {
		const onOpenChange = vi.fn();
		await renderWithProviders(
			<RemoveDownloadDialog item={item as never} onOpenChange={onOpenChange} />,
		);

		await page.getByLabelText("Add release to blocklist").click();
		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("submits the selected options and closes on successful removal", async () => {
		const onOpenChange = vi.fn();
		removeDownloadDialogMocks.mutate.mockImplementation(
			(
				_variables: unknown,
				options?: {
					onSuccess?: () => void;
				},
			) => {
				options?.onSuccess?.();
			},
		);

		await renderWithProviders(
			<RemoveDownloadDialog item={item as never} onOpenChange={onOpenChange} />,
		);

		await page.getByLabelText("Remove from download client").click();
		await page.getByLabelText("Add release to blocklist").click();
		await page.getByRole("button", { name: "Remove" }).click();

		expect(removeDownloadDialogMocks.mutate).toHaveBeenCalledWith(
			{
				downloadClientId: 12,
				downloadItemId: "dl-123",
				removeFromClient: false,
				addToBlocklist: true,
				sourceTitle: "Ubuntu ISO",
				protocol: "torrent",
			},
			expect.any(Object),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("does not reset checkbox state when the dialog stays open", async () => {
		await renderWithProviders(
			<RemoveDownloadDialog item={item as never} onOpenChange={vi.fn()} />,
		);

		await page.getByLabelText("Remove from download client").click();
		await page.getByLabelText("Add release to blocklist").click();
		await page.getByRole("button", { name: "Keep dialog open" }).click();

		await expect
			.element(page.getByLabelText("Remove from download client"))
			.not.toBeChecked();
		await expect
			.element(page.getByLabelText("Add release to blocklist"))
			.toBeChecked();
	});

	it("does nothing when remove is clicked without an item", async () => {
		await renderWithProviders(
			<RemoveDownloadDialog item={null} onOpenChange={vi.fn()} />,
		);

		await page.getByRole("button", { name: "Remove" }).click();

		expect(removeDownloadDialogMocks.mutate).not.toHaveBeenCalled();
	});

	it("shows a pending label while removal is in progress", async () => {
		removeDownloadDialogMocks.isPending = true;

		await renderWithProviders(
			<RemoveDownloadDialog item={item as never} onOpenChange={vi.fn()} />,
		);

		await expect
			.element(page.getByRole("button", { name: "Removing..." }))
			.toBeDisabled();
	});
});
