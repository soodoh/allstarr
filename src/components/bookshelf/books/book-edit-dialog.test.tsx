import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const bookEditDialogMocks = vi.hoisted(() => ({
	updateBook: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("src/hooks/mutations", () => ({
	useUpdateBook: () => bookEditDialogMocks.updateBook,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
	}: PropsWithChildren<{
		disabled?: boolean;
		onClick?: () => void;
	}>) => (
		<button disabled={disabled} onClick={onClick} type="button">
			{children}
		</button>
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
	DialogBody: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogDescription: ({ children }: PropsWithChildren) => <p>{children}</p>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/label", () => ({
	default: ({ children, htmlFor }: PropsWithChildren<{ htmlFor?: string }>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("src/components/ui/switch", () => ({
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
			aria-checked={checked ? "true" : "false"}
			checked={checked}
			id={id}
			onChange={(event) => onCheckedChange(event.target.checked)}
			role="switch"
			type="checkbox"
		/>
	),
}));

import BookEditDialog from "./book-edit-dialog";

describe("BookEditDialog", () => {
	afterEach(() => {
		bookEditDialogMocks.updateBook.isPending = false;
		bookEditDialogMocks.updateBook.mutate.mockReset();
	});

	it("saves the selected auto-switch setting and closes on success", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const onSuccess = vi.fn();
		bookEditDialogMocks.updateBook.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		const { getByRole } = renderWithProviders(
			<BookEditDialog
				bookId={4}
				bookTitle="The Example"
				autoSwitchEdition={false}
				onOpenChange={onOpenChange}
				onSuccess={onSuccess}
				open
			/>,
		);

		await user.click(getByRole("switch"));
		await user.click(getByRole("button", { name: "Save" }));

		expect(bookEditDialogMocks.updateBook.mutate).toHaveBeenCalledWith(
			{
				id: 4,
				autoSwitchEdition: true,
			},
			expect.any(Object),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSuccess).toHaveBeenCalled();
	});

	it("resets the switch when reopened with new settings", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const { getByRole, rerender } = renderWithProviders(
			<BookEditDialog
				bookId={9}
				bookTitle="Reset Me"
				autoSwitchEdition={false}
				onOpenChange={onOpenChange}
				onSuccess={vi.fn()}
				open
			/>,
		);

		await user.click(getByRole("switch"));
		expect(getByRole("switch")).toBeChecked();

		rerender(
			<BookEditDialog
				bookId={9}
				bookTitle="Reset Me"
				autoSwitchEdition={true}
				onOpenChange={onOpenChange}
				onSuccess={vi.fn()}
				open={false}
			/>,
		);
		rerender(
			<BookEditDialog
				bookId={9}
				bookTitle="Reset Me"
				autoSwitchEdition={true}
				onOpenChange={onOpenChange}
				onSuccess={vi.fn()}
				open
			/>,
		);

		expect(getByRole("switch")).toBeChecked();
	});
});
