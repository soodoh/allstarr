import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div data-testid="dialog-content">{children}</div>
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

import ConfirmDialog from "./confirm-dialog";

describe("ConfirmDialog", () => {
	it("does not render content when closed", async () => {
		renderWithProviders(
			<ConfirmDialog
				description="Delete this item permanently."
				onConfirm={vi.fn()}
				onOpenChange={vi.fn()}
				open={false}
				title="Delete item"
			/>,
		);

		await expect
			.element(page.getByTestId("dialog-root"))
			.not.toBeInTheDocument();
	});

	it("renders content and wires cancel and confirm actions", async () => {
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();

		renderWithProviders(
			<ConfirmDialog
				description="Delete this item permanently."
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
				open
				title="Delete item"
				variant="default"
			/>,
		);

		await expect.element(page.getByText("Delete item")).toBeInTheDocument();
		await expect
			.element(page.getByText("Delete this item permanently."))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Cancel" }).click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("shows the loading state and disables confirmation while busy", async () => {
		renderWithProviders(
			<ConfirmDialog
				description="Delete this item permanently."
				loading
				onConfirm={vi.fn()}
				onOpenChange={vi.fn()}
				open
				title="Delete item"
			/>,
		);

		await expect
			.element(page.getByRole("button", { name: "Deleting..." }))
			.toBeDisabled();
	});
});
