import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const { deleteBookState, deleteEditionState } = vi.hoisted(() => ({
	deleteBookState: {
		isPending: false,
		mutate: vi.fn(),
	},
	deleteEditionState: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("src/components/ui/popover", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		loading,
		onConfirm,
		open,
		title,
	}: {
		description: string;
		loading?: boolean;
		onConfirm: () => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<h2>{title}</h2>
				<p>{description}</p>
				<button disabled={loading} type="button" onClick={onConfirm}>
					Confirm delete
				</button>
			</div>
		) : null,
}));

vi.mock("src/hooks/mutations", () => ({
	useDeleteBook: () => deleteBookState,
	useDeleteEdition: () => deleteEditionState,
}));

import MetadataWarning from "./metadata-warning";

describe("MetadataWarning", () => {
	afterEach(() => {
		deleteBookState.isPending = false;
		deleteEditionState.isPending = false;
		deleteBookState.mutate.mockReset();
		deleteEditionState.mutate.mockReset();
	});

	it("renders the book-editions warning without action buttons", () => {
		const { getByText, queryByRole } = renderWithProviders(
			<MetadataWarning
				itemId={7}
				itemTitle="Dune"
				missingEditionsCount={3}
				missingSince={new Date("2025-01-01")}
				type="book-editions"
			/>,
		);

		expect(getByText("Missing from Hardcover")).toBeInTheDocument();
		expect(
			getByText(
				"3 edition(s) of this book are no longer available on Hardcover",
			),
		).toBeInTheDocument();
		expect(
			queryByRole("button", { name: "Delete Book" }),
		).not.toBeInTheDocument();
	});

	it("reassigns files and deletes a book through the book mutation", async () => {
		const user = userEvent.setup();
		const onDeleted = vi.fn();
		const onReassignFiles = vi.fn();
		deleteBookState.mutate.mockImplementation(
			(
				_data: {
					addImportExclusion: boolean;
					deleteFiles: boolean;
					id: number;
				},
				options?: { onSuccess?: () => void },
			) => options?.onSuccess?.(),
		);

		const { getByRole } = renderWithProviders(
			<MetadataWarning
				fileCount={2}
				itemId={7}
				itemTitle="Dune"
				missingSince={new Date("2025-01-01")}
				onDeleted={onDeleted}
				onReassignFiles={onReassignFiles}
				type="book"
			/>,
		);

		await user.click(getByRole("button", { name: "Reassign 2 File(s)" }));
		await user.click(getByRole("button", { name: "Delete Book" }));
		await user.click(getByRole("button", { name: "Confirm delete" }));

		expect(onReassignFiles).toHaveBeenCalledTimes(1);
		expect(deleteBookState.mutate).toHaveBeenCalledWith(
			{ addImportExclusion: false, deleteFiles: false, id: 7 },
			expect.any(Object),
		);
		expect(onDeleted).toHaveBeenCalledTimes(1);
	});

	it("deletes an edition through the edition mutation", async () => {
		const user = userEvent.setup();
		const onDeleted = vi.fn();
		deleteEditionState.mutate.mockImplementation(
			(_id: number, options?: { onSuccess?: () => void }) =>
				options?.onSuccess?.(),
		);

		const { getByRole } = renderWithProviders(
			<MetadataWarning
				itemId={11}
				itemTitle="Dune Hardcover"
				missingSince={new Date("2025-01-01")}
				onDeleted={onDeleted}
				type="edition"
			/>,
		);

		await user.click(getByRole("button", { name: "Delete Edition" }));
		await user.click(getByRole("button", { name: "Confirm delete" }));

		expect(deleteEditionState.mutate).toHaveBeenCalledWith(
			11,
			expect.any(Object),
		);
		expect(onDeleted).toHaveBeenCalledTimes(1);
	});

	it("passes pending state through to the confirm action", async () => {
		const user = userEvent.setup();
		deleteBookState.isPending = true;

		const { getByRole } = renderWithProviders(
			<MetadataWarning
				itemId={7}
				itemTitle="Dune"
				missingSince={new Date("2025-01-01")}
				type="book"
			/>,
		);

		await user.click(getByRole("button", { name: "Delete Book" }));

		expect(getByRole("button", { name: "Confirm delete" })).toBeDisabled();
	});
});
