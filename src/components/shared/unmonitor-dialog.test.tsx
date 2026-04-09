import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			aria-label={id}
			checked={checked}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		className,
		htmlFor,
	}: {
		children: ReactNode;
		className?: string;
		htmlFor?: string;
	}) => (
		<label className={className} htmlFor={htmlFor}>
			{children}
		</label>
	),
}));

import UnmonitorDialog from "./unmonitor-dialog";

describe("UnmonitorDialog", () => {
	it("renders the base confirmation text without delete controls when there are no files", () => {
		const { getByText, queryByRole } = renderWithProviders(
			<UnmonitorDialog
				fileCount={0}
				isPending={false}
				itemTitle="Dune"
				itemType="book"
				onConfirm={vi.fn()}
				onOpenChange={vi.fn()}
				open
				profileName="Standard"
			/>,
		);

		expect(getByText("Unmonitor Standard?")).toBeInTheDocument();
		expect(getByText(/This will stop searching for book/i)).toBeInTheDocument();
		expect(queryByRole("checkbox")).not.toBeInTheDocument();
	});

	it("toggles delete files and resets the value when canceled", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();

		const { getByLabelText, getByRole } = renderWithProviders(
			<UnmonitorDialog
				fileCount={2}
				isPending={false}
				itemTitle="Dune"
				itemType="book"
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
				open
				profileName="Standard"
			/>,
		);

		await user.click(getByLabelText("delete-files"));
		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onConfirm).toHaveBeenCalledWith(true);

		await user.click(getByRole("button", { name: "Cancel" }));
		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onConfirm).toHaveBeenLastCalledWith(false);
	});

	it("disables confirmation while pending", () => {
		const { getByRole } = renderWithProviders(
			<UnmonitorDialog
				fileCount={1}
				isPending
				itemTitle="Dune"
				itemType="book"
				onConfirm={vi.fn()}
				onOpenChange={vi.fn()}
				open
				profileName="Standard"
			/>,
		);

		expect(getByRole("button", { name: "Confirm" })).toBeDisabled();
	});
});
