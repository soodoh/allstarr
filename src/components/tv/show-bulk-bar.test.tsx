import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

const showBulkBarMocks = vi.hoisted(() => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	updateShow: {
		mutateAsync: vi.fn(),
	},
}));

vi.mock("sonner", () => ({
	toast: showBulkBarMocks.toast,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value?: string;
	}) => (
		<select
			onChange={(event) => onValueChange?.(event.target.value)}
			value={value}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => children,
	SelectValue: () => null,
}));

vi.mock("src/hooks/mutations/shows", () => ({
	useUpdateShow: () => showBulkBarMocks.updateShow,
}));

import ShowBulkBar from "./show-bulk-bar";

describe("ShowBulkBar", () => {
	beforeEach(() => {
		showBulkBarMocks.toast.error.mockReset();
		showBulkBarMocks.toast.success.mockReset();
		showBulkBarMocks.updateShow.mutateAsync.mockReset();
	});

	it("disables apply when nothing is selected", async () => {
		await renderWithProviders(
			<ShowBulkBar onDone={vi.fn()} profiles={[]} selectedIds={new Set()} />,
		);

		await expect
			.element(page.getByRole("button", { name: "Apply" }))
			.toBeDisabled();
	});

	it("applies selected profile and series type updates to every selected show", async () => {
		const onDone = vi.fn();
		showBulkBarMocks.updateShow.mutateAsync.mockResolvedValue(undefined);

		await renderWithProviders(
			<ShowBulkBar
				onDone={onDone}
				profiles={[
					{ id: 11, name: "4K" },
					{ id: 12, name: "HD" },
				]}
				selectedIds={new Set([1, 2])}
			/>,
		);

		const selects = page.getByRole("combobox").all();
		await userEvent.selectOptions(selects[0], "11");
		await userEvent.selectOptions(selects[1], "anime");
		await page.getByRole("button", { name: "Apply" }).click();

		expect(showBulkBarMocks.updateShow.mutateAsync).toHaveBeenNthCalledWith(1, {
			downloadProfileIds: [11],
			id: 1,
			seriesType: "anime",
		});
		expect(showBulkBarMocks.updateShow.mutateAsync).toHaveBeenNthCalledWith(2, {
			downloadProfileIds: [11],
			id: 2,
			seriesType: "anime",
		});
		expect(showBulkBarMocks.toast.success).toHaveBeenCalledWith(
			"Updated 2 shows",
		);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast when one of the updates fails", async () => {
		showBulkBarMocks.updateShow.mutateAsync.mockRejectedValue(
			new Error("boom"),
		);

		await renderWithProviders(
			<ShowBulkBar
				onDone={vi.fn()}
				profiles={[{ id: 11, name: "4K" }]}
				selectedIds={new Set([5])}
			/>,
		);

		await page.getByRole("button", { name: "Apply" }).click();

		expect(showBulkBarMocks.toast.error).toHaveBeenCalledWith(
			"Some updates failed",
		);
		await expect
			.element(page.getByRole("button", { name: "Apply" }))
			.toBeEnabled();
	});
});
