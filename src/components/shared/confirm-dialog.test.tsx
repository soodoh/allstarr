import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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
	it("does not render content when closed", () => {
		const { queryByTestId } = renderWithProviders(
			<ConfirmDialog
				description="Delete this item permanently."
				onConfirm={vi.fn()}
				onOpenChange={vi.fn()}
				open={false}
				title="Delete item"
			/>,
		);

		expect(queryByTestId("dialog-root")).not.toBeInTheDocument();
	});

	it("renders content and wires cancel and confirm actions", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();

		const { getByRole, getByText } = renderWithProviders(
			<ConfirmDialog
				description="Delete this item permanently."
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
				open
				title="Delete item"
				variant="default"
			/>,
		);

		expect(getByText("Delete item")).toBeInTheDocument();
		expect(getByText("Delete this item permanently.")).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Cancel" }));
		await user.click(getByRole("button", { name: "Confirm" }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("shows the loading state and disables confirmation while busy", () => {
		const { getByRole } = renderWithProviders(
			<ConfirmDialog
				description="Delete this item permanently."
				loading
				onConfirm={vi.fn()}
				onOpenChange={vi.fn()}
				open
				title="Delete item"
			/>,
		);

		expect(getByRole("button", { name: "Deleting..." })).toBeDisabled();
	});
});
