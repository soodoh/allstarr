import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const bookDeleteDialogMocks = vi.hoisted(() => ({
	deleteBook: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("src/hooks/mutations", () => ({
	useDeleteBook: () => bookDeleteDialogMocks.deleteBook,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		variant,
	}: PropsWithChildren<{
		disabled?: boolean;
		onClick?: () => void;
		variant?: string;
	}>) => (
		<button
			data-variant={variant}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			aria-checked={checked ? "true" : "false"}
			checked={Boolean(checked)}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		open,
	}: PropsWithChildren<{
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}>) => (open ? <div data-testid="dialog">{children}</div> : null),
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogDescription: ({ children }: PropsWithChildren) => <p>{children}</p>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		className,
		htmlFor,
	}: PropsWithChildren<{ className?: string; htmlFor?: string }>) => (
		<label className={className} htmlFor={htmlFor}>
			{children}
		</label>
	),
}));

import BookDeleteDialog from "./book-delete-dialog";

describe("BookDeleteDialog", () => {
	afterEach(() => {
		bookDeleteDialogMocks.deleteBook.isPending = false;
		bookDeleteDialogMocks.deleteBook.mutate.mockReset();
	});

	it("submits the selected delete options and closes on success", async () => {
		const onOpenChange = vi.fn();
		const onSuccess = vi.fn();
		bookDeleteDialogMocks.deleteBook.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		await renderWithProviders(
			<BookDeleteDialog
				bookId={77}
				bookTitle="The Long Road"
				fileCount={2}
				foreignBookId="hardcover-123"
				onOpenChange={onOpenChange}
				onSuccess={onSuccess}
				open
			/>,
		);

		await page.getByLabelText("Delete 2 book files from disk").click();
		await page
			.getByLabelText("Prevent re-addition during author refresh")
			.click();
		await page.getByRole("button", { name: "Delete" }).click();

		expect(bookDeleteDialogMocks.deleteBook.mutate).toHaveBeenCalledWith(
			{
				id: 77,
				deleteFiles: true,
				addImportExclusion: false,
			},
			expect.any(Object),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSuccess).toHaveBeenCalled();
	});

	it("resets its checkbox state when reopened and omits the exclusion option without a foreign book id", async () => {
		const onOpenChange = vi.fn();
		const { rerender } = await renderWithProviders(
			<BookDeleteDialog
				bookId={12}
				bookTitle="Standalone"
				fileCount={1}
				foreignBookId={null}
				onOpenChange={onOpenChange}
				onSuccess={vi.fn()}
				open
			/>,
		);

		await page.getByLabelText("Delete 1 book file from disk").click();
		await expect
			.element(page.getByLabelText("Delete 1 book file from disk"))
			.toBeChecked();
		await expect
			.element(page.getByLabelText("Prevent re-addition during author refresh"))
			.not.toBeInTheDocument();

		await rerender(
			<BookDeleteDialog
				bookId={12}
				bookTitle="Standalone"
				fileCount={1}
				foreignBookId={null}
				onOpenChange={onOpenChange}
				onSuccess={vi.fn()}
				open={false}
			/>,
		);
		await rerender(
			<BookDeleteDialog
				bookId={12}
				bookTitle="Standalone"
				fileCount={1}
				foreignBookId={null}
				onOpenChange={onOpenChange}
				onSuccess={vi.fn()}
				open
			/>,
		);

		await expect
			.element(page.getByLabelText("Delete 1 book file from disk"))
			.not.toBeChecked();
	});
});
