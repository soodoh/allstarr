import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const onSuccess = vi.fn();
		reassignFilesDialogMocks.reassign.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		const { getByPlaceholderText, getByRole, queryByText } =
			renderWithProviders(
				<ReassignFilesDialog
					fileCount={2}
					fromBookId={1}
					fromBookTitle="Origin Book"
					onOpenChange={onOpenChange}
					onSuccess={onSuccess}
					open
				/>,
			);

		expect(queryByText("Origin Book")).toBeNull();

		await user.type(getByPlaceholderText("Search books..."), "target");
		expect(queryByText("Second Book")).toBeNull();

		await user.click(getByRole("button", { name: /Target Book/i }));
		await user.click(getByRole("button", { name: "Reassign" }));

		expect(reassignFilesDialogMocks.reassign.mutate).toHaveBeenCalledWith(
			{ fromBookId: 1, toBookId: 3 },
			expect.any(Object),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSuccess).toHaveBeenCalledTimes(1);
	});

	it("shows the loading and empty states and keeps reassign disabled without a selection", () => {
		reassignFilesDialogMocks.useQuery.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
		});

		const loadingView = renderWithProviders(
			<ReassignFilesDialog
				fileCount={1}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={vi.fn()}
				open
			/>,
		);

		expect(loadingView.getByText("Loading")).toBeInTheDocument();
		loadingView.unmount();

		reassignFilesDialogMocks.useQuery.mockReturnValueOnce({
			data: [{ authorName: "Alpha", id: 1, title: "Origin Book" }],
			isLoading: false,
		});

		const emptyView = renderWithProviders(
			<ReassignFilesDialog
				fileCount={1}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={vi.fn()}
				open
			/>,
		);

		expect(emptyView.getByText("No books found.")).toBeInTheDocument();
		expect(emptyView.getByRole("button", { name: "Reassign" })).toBeDisabled();
	});

	it("resets search and selection when the dialog closes", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const { getByPlaceholderText, getByRole, queryByText, rerender } =
			renderWithProviders(
				<ReassignFilesDialog
					fileCount={3}
					fromBookId={1}
					fromBookTitle="Origin Book"
					onOpenChange={onOpenChange}
					open
				/>,
			);

		await user.type(getByPlaceholderText("Search books..."), "target");
		await user.click(getByRole("button", { name: /Target Book/i }));
		expect(queryByText("Selected:")).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Close dialog" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);

		rerender(
			<ReassignFilesDialog
				fileCount={3}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={onOpenChange}
				open={false}
			/>,
		);
		rerender(
			<ReassignFilesDialog
				fileCount={3}
				fromBookId={1}
				fromBookTitle="Origin Book"
				onOpenChange={onOpenChange}
				open
			/>,
		);

		expect(getByPlaceholderText("Search books...")).toHaveValue("");
		expect(queryByText("Selected:")).toBeNull();
	});
});
