import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const removeDownloadDialogMocks = vi.hoisted(() => ({
	mutate: vi.fn(),
}));

vi.mock("src/hooks/mutations", () => ({
	useRemoveFromQueue: () => ({
		isPending: false,
		mutate: removeDownloadDialogMocks.mutate,
	}),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: PropsWithChildren<{ open: boolean }>) => (
		<div data-open={String(open)}>{children}</div>
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
	});

	const item = {
		downloadClientId: 12,
		id: "dl-123",
		name: "Ubuntu ISO",
		protocol: "torrent",
	};

	it("opens for an item and resets option state when cancelled", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const { getByLabelText, getByRole } = renderWithProviders(
			<RemoveDownloadDialog item={item as never} onOpenChange={onOpenChange} />,
		);

		await user.click(getByLabelText("Add release to blocklist"));
		await user.click(getByRole("button", { name: "Cancel" }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("submits the selected options and closes on successful removal", async () => {
		const user = userEvent.setup();
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

		const { getByLabelText, getByRole } = renderWithProviders(
			<RemoveDownloadDialog item={item as never} onOpenChange={onOpenChange} />,
		);

		await user.click(getByLabelText("Remove from download client"));
		await user.click(getByLabelText("Add release to blocklist"));
		await user.click(getByRole("button", { name: "Remove" }));

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

	it("does nothing when remove is clicked without an item", async () => {
		const user = userEvent.setup();
		const { getByRole } = renderWithProviders(
			<RemoveDownloadDialog item={null} onOpenChange={vi.fn()} />,
		);

		await user.click(getByRole("button", { name: "Remove" }));

		expect(removeDownloadDialogMocks.mutate).not.toHaveBeenCalled();
	});
});
