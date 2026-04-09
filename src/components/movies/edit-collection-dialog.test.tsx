import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const editCollectionDialogMocks = vi.hoisted(() => ({
	allProfiles: [
		{ contentType: "movie", icon: "movie", id: 7, name: "4K" },
		{ contentType: "tv", icon: "tv", id: 8, name: "TV Only" },
		{ contentType: "movie", icon: "movie", id: 9, name: "HD" },
	],
	updateCollection: {
		isPending: false,
		mutate: vi.fn(),
	},
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: unknown[]) =>
			editCollectionDialogMocks.useQuery(...args),
	};
});

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) => (
		<button disabled={disabled} onClick={onClick} type="button">
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
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			aria-checked={Boolean(checked)}
			checked={Boolean(checked)}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog">{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor?: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
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

vi.mock("src/components/ui/switch", () => ({
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
			aria-checked={checked ? "true" : "false"}
			checked={Boolean(checked)}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			role="switch"
			type="checkbox"
		/>
	),
}));

vi.mock("src/hooks/mutations/movie-collections", () => ({
	useUpdateMovieCollection: () => editCollectionDialogMocks.updateCollection,
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () => ({
		queryKey: ["download-profiles", "list"],
	}),
}));

import EditCollectionDialog from "./edit-collection-dialog";

describe("EditCollectionDialog", () => {
	beforeEach(() => {
		editCollectionDialogMocks.updateCollection.isPending = false;
		editCollectionDialogMocks.updateCollection.mutate.mockReset();
		editCollectionDialogMocks.useQuery.mockReset();
		editCollectionDialogMocks.useQuery.mockReturnValue({
			data: editCollectionDialogMocks.allProfiles,
		});
	});

	it("hydrates the dialog from the selected collection and only shows movie profiles", () => {
		const { getByLabelText, getByRole, queryByLabelText, queryByText } =
			renderWithProviders(
				<EditCollectionDialog
					collection={{
						downloadProfileIds: [7],
						id: 1,
						minimumAvailability: "inCinemas",
						monitored: true,
						title: "Alien Anthology",
					}}
					onOpenChange={vi.fn()}
					open
				/>,
			);

		expect(
			getByRole("heading", { name: "Edit Alien Anthology" }),
		).toBeInTheDocument();
		expect(getByLabelText("Monitored")).toBeChecked();
		expect(getByRole("combobox")).toHaveValue("inCinemas");
		expect(getByLabelText("4K")).toBeChecked();
		expect(queryByLabelText("HD")).not.toBeChecked();
		expect(queryByText("TV Only")).not.toBeInTheDocument();
	});

	it("saves the edited collection and closes on success", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		editCollectionDialogMocks.updateCollection.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		const { getByLabelText, getByRole } = renderWithProviders(
			<EditCollectionDialog
				collection={{
					downloadProfileIds: [7, 9],
					id: 2,
					minimumAvailability: "released",
					monitored: false,
					title: "Back to the Future",
				}}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await user.click(getByLabelText("Monitored"));
		await user.selectOptions(getByRole("combobox"), "announced");
		await user.click(getByLabelText("4K"));
		await user.click(getByLabelText("HD"));
		await user.click(getByRole("button", { name: "Save" }));

		expect(
			editCollectionDialogMocks.updateCollection.mutate,
		).toHaveBeenCalledWith(
			{
				downloadProfileIds: [],
				id: 2,
				minimumAvailability: "announced",
				monitored: true,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
