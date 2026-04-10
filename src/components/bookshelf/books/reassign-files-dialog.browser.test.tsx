import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const reassignFilesDialogMocks = vi.hoisted(() => ({
	allBooks: [
		{ authorName: "Alpha", id: 1, title: "Origin Book" },
		{ authorName: "Beta", id: 2, title: "Second Book" },
		{ authorName: "Gamma", id: 3, title: "Target Book" },
	],
	isLoading: false,
	reassign: {
		isPending: false,
		mutate: vi.fn(),
	},
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			reassignFilesDialogMocks.useQuery(...args),
	};
});

vi.mock("lucide-react", () => ({
	Loader2: ({ className }: { className?: string }) => (
		<span className={className}>Loading</span>
	),
}));

vi.mock("src/hooks/mutations", () => ({
	useReassignBookFiles: () => reassignFilesDialogMocks.reassign,
}));

vi.mock("src/server/books", () => ({
	getBooksFn: vi.fn(async () => reassignFilesDialogMocks.allBooks),
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

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		onOpenChange,
		open,
	}: PropsWithChildren<{
		onOpenChange: (open: boolean) => void;
		open: boolean;
	}>) =>
		open ? (
			<div data-testid="dialog">
				{children}
				<button onClick={() => onOpenChange(false)} type="button">
					Close dialog
				</button>
			</div>
		) : null,
	DialogBody: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogContent: ({ children }: PropsWithChildren<{ className?: string }>) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: PropsWithChildren) => <p>{children}</p>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		onChange,
		placeholder,
		value,
	}: {
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => <input onChange={onChange} placeholder={placeholder} value={value} />,
}));

import ReassignFilesDialog from "./reassign-files-dialog";

describe("ReassignFilesDialog", () => {
	beforeEach(() => {
		reassignFilesDialogMocks.isLoading = false;
		reassignFilesDialogMocks.reassign.isPending = false;
		reassignFilesDialogMocks.reassign.mutate.mockReset();
		reassignFilesDialogMocks.useQuery.mockReturnValue({
			data: reassignFilesDialogMocks.allBooks,
			isLoading: reassignFilesDialogMocks.isLoading,
		});
	});

	afterEach(() => {
		reassignFilesDialogMocks.reassign.mutate.mockReset();
	});

	it("filters out the source book, searches targets, and reassigns on success", async () => {
		const onOpenChange = vi.fn();
		const onSuccess = vi.fn();
		reassignFilesDialogMocks.reassign.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		await renderWithProviders(
			<ReassignFilesDialog
				fileCount={2}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={onOpenChange}
				onSuccess={onSuccess}
				open
			/>,
		);

		// Origin Book should not appear as a selectable book button (filtered out)
		await expect
			.element(page.getByRole("button", { name: /Origin Book/i }))
			.not.toBeInTheDocument();

		await page.getByPlaceholder("Search books...").fill("target");
		await expect.element(page.getByText("Second Book")).not.toBeInTheDocument();

		await page.getByRole("button", { name: /Target Book/i }).click();
		await page.getByRole("button", { name: "Reassign" }).click();

		expect(reassignFilesDialogMocks.reassign.mutate).toHaveBeenCalledWith(
			{ fromBookId: 1, toBookId: 3 },
			expect.any(Object),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSuccess).toHaveBeenCalledTimes(1);
	});

	it("shows the loading and empty states and keeps reassign disabled without a selection", async () => {
		reassignFilesDialogMocks.useQuery.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
		});

		const { unmount } = await renderWithProviders(
			<ReassignFilesDialog
				fileCount={1}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={vi.fn()}
				open
			/>,
		);

		await expect.element(page.getByText("Loading")).toBeInTheDocument();
		unmount();

		reassignFilesDialogMocks.useQuery.mockReturnValueOnce({
			data: [{ authorName: "Alpha", id: 1, title: "Origin Book" }],
			isLoading: false,
		});

		await renderWithProviders(
			<ReassignFilesDialog
				fileCount={1}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={vi.fn()}
				open
			/>,
		);

		await expect.element(page.getByText("No books found.")).toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Reassign" }))
			.toBeDisabled();
	});

	it("resets search and selection when the dialog closes", async () => {
		const onOpenChange = vi.fn();
		const { rerender } = await renderWithProviders(
			<ReassignFilesDialog
				fileCount={3}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await page.getByPlaceholder("Search books...").fill("target");
		await page.getByRole("button", { name: /Target Book/i }).click();
		await expect.element(page.getByText("Selected:")).toBeInTheDocument();

		await page.getByRole("button", { name: "Close dialog" }).click();
		expect(onOpenChange).toHaveBeenCalledWith(false);

		await rerender(
			<ReassignFilesDialog
				fileCount={3}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={onOpenChange}
				open={false}
			/>,
		);
		await rerender(
			<ReassignFilesDialog
				fileCount={3}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await expect
			.element(page.getByPlaceholder("Search books..."))
			.toHaveValue("");
		await expect.element(page.getByText("Selected:")).not.toBeInTheDocument();
	});
});
