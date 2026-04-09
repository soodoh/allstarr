import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const movieBulkBarMocks = vi.hoisted(() => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	updateMovie: {
		mutateAsync: vi.fn(),
	},
}));

vi.mock("sonner", () => ({
	toast: movieBulkBarMocks.toast,
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

vi.mock("src/hooks/mutations/movies", () => ({
	useUpdateMovie: () => movieBulkBarMocks.updateMovie,
}));

import MovieBulkBar from "./movie-bulk-bar";

describe("MovieBulkBar", () => {
	beforeEach(() => {
		movieBulkBarMocks.toast.error.mockReset();
		movieBulkBarMocks.toast.success.mockReset();
		movieBulkBarMocks.updateMovie.mutateAsync.mockReset();
	});

	it("disables apply when nothing is selected", () => {
		const { getByRole } = renderWithProviders(
			<MovieBulkBar onDone={vi.fn()} profiles={[]} selectedIds={new Set()} />,
		);

		expect(getByRole("button", { name: "Apply" })).toBeDisabled();
	});

	it("applies selected profile and availability updates to every selected movie", async () => {
		const user = userEvent.setup();
		const onDone = vi.fn();
		movieBulkBarMocks.updateMovie.mutateAsync.mockResolvedValue(undefined);

		const { getAllByRole, getByRole } = renderWithProviders(
			<MovieBulkBar
				onDone={onDone}
				profiles={[
					{ id: 7, name: "4K" },
					{ id: 8, name: "HD" },
				]}
				selectedIds={new Set([1, 2])}
			/>,
		);

		const selects = getAllByRole("combobox");
		await user.selectOptions(selects[0] as HTMLSelectElement, "7");
		await user.selectOptions(selects[1] as HTMLSelectElement, "released");
		await user.click(getByRole("button", { name: "Apply" }));

		expect(movieBulkBarMocks.updateMovie.mutateAsync).toHaveBeenNthCalledWith(
			1,
			{
				downloadProfileIds: [7],
				id: 1,
				minimumAvailability: "released",
			},
		);
		expect(movieBulkBarMocks.updateMovie.mutateAsync).toHaveBeenNthCalledWith(
			2,
			{
				downloadProfileIds: [7],
				id: 2,
				minimumAvailability: "released",
			},
		);
		expect(movieBulkBarMocks.toast.success).toHaveBeenCalledWith(
			"Updated 2 movies",
		);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast when one of the updates fails", async () => {
		const user = userEvent.setup();
		movieBulkBarMocks.updateMovie.mutateAsync.mockRejectedValue(
			new Error("boom"),
		);

		const { getByRole } = renderWithProviders(
			<MovieBulkBar
				onDone={vi.fn()}
				profiles={[{ id: 7, name: "4K" }]}
				selectedIds={new Set([9])}
			/>,
		);

		await user.click(getByRole("button", { name: "Apply" }));

		expect(movieBulkBarMocks.toast.error).toHaveBeenCalledWith(
			"Some updates failed",
		);
		expect(getByRole("button", { name: "Apply" })).toBeEnabled();
	});
});
