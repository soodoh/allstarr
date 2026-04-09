import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		open,
		onOpenChange,
	}: {
		children: ReactNode;
		open: boolean;
		onOpenChange?: (open: boolean) => void;
	}) => (
		<div>
			{open ? <div data-testid="dialog-root">{children}</div> : null}
			<button
				type="button"
				data-testid="dialog-open"
				onClick={() => onOpenChange?.(true)}
			/>
			<button
				type="button"
				data-testid="dialog-close"
				onClick={() => onOpenChange?.(false)}
			/>
		</div>
	),
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
	it("renders the base confirmation text without delete controls when there are no files", async () => {
		renderWithProviders(
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

		await expect
			.element(page.getByText("Unmonitor Standard?"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText(/This will stop searching for book/i))
			.toBeInTheDocument();
		await expect.element(page.getByRole("checkbox")).not.toBeInTheDocument();
	});

	it("toggles delete files and resets the value when canceled", async () => {
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();

		renderWithProviders(
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

		await page.getByLabelText("delete-files").click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onConfirm).toHaveBeenCalledWith(true);

		await page.getByRole("button", { name: "Cancel" }).click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onConfirm).toHaveBeenLastCalledWith(false);
	});

	it("passes open changes through without clearing the file toggle", async () => {
		const onOpenChange = vi.fn();

		renderWithProviders(
			<UnmonitorDialog
				fileCount={2}
				isPending={false}
				itemTitle="Dune"
				itemType="book"
				onConfirm={vi.fn()}
				onOpenChange={onOpenChange}
				open
				profileName="Standard"
			/>,
		);

		await page.getByLabelText("delete-files").click();
		await page.getByTestId("dialog-open").click();

		expect(onOpenChange).toHaveBeenCalledWith(true);
		await expect.element(page.getByLabelText("delete-files")).toBeChecked();
	});

	it("disables confirmation while pending", async () => {
		const { container } = await renderWithProviders(
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

		expect(container.querySelector(".animate-spin")).not.toBeNull();
		await expect
			.element(page.getByRole("button", { name: "Confirm" }))
			.toBeDisabled();
	});
});
