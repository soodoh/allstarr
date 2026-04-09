import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addMissingMoviesDialogMocks = vi.hoisted(() => ({
	allProfiles: [
		{ contentType: "movie", icon: "movie", id: 7, name: "4K" },
		{ contentType: "tv", icon: "tv", id: 8, name: "TV Only" },
		{ contentType: "movie", icon: "movie", id: 9, name: "HD" },
	],
	addMissing: {
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
			addMissingMoviesDialogMocks.useQuery(...args),
	};
});

vi.mock("src/components/shared/profile-checkbox-group", () => ({
	default: ({
		onToggle,
		profiles,
		selectedIds,
	}: {
		onToggle: (id: number) => void;
		profiles: Array<{ id: number; name: string }>;
		selectedIds: number[];
	}) => (
		<div data-testid="profile-checkbox-group">
			{profiles.length === 0 ? (
				<p>No download profiles available.</p>
			) : (
				profiles.map((profile) => (
					<label key={profile.id}>
						<input
							checked={selectedIds.includes(profile.id)}
							onChange={() => onToggle(profile.id)}
							type="checkbox"
						/>
						{profile.name}
					</label>
				))
			)}
		</div>
	),
}));

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

vi.mock("src/hooks/mutations/movie-collections", () => ({
	useAddMissingCollectionMovies: () => addMissingMoviesDialogMocks.addMissing,
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () => ({
		queryKey: ["download-profiles", "list"],
	}),
}));

import AddMissingMoviesDialog from "./add-missing-movies-dialog";

describe("AddMissingMoviesDialog", () => {
	beforeEach(() => {
		addMissingMoviesDialogMocks.addMissing.isPending = false;
		addMissingMoviesDialogMocks.addMissing.mutate.mockReset();
		addMissingMoviesDialogMocks.useQuery.mockReset();
		addMissingMoviesDialogMocks.useQuery.mockReturnValue({
			data: addMissingMoviesDialogMocks.allProfiles,
		});
	});

	it("hydrates the default options when the dialog opens", () => {
		const { getAllByRole, getByLabelText, getByRole, getByText, queryByText } =
			renderWithProviders(
				<AddMissingMoviesDialog
					collection={{
						id: 1,
						missingMovies: 2,
						title: "Dune Collection",
					}}
					onOpenChange={vi.fn()}
					open
				/>,
			);

		expect(
			getByRole("heading", { name: "Add Missing Movies" }),
		).toBeInTheDocument();
		expect(
			getByText("Add 2 missing movies to Dune Collection"),
		).toBeInTheDocument();
		expect(getByLabelText("4K")).toBeChecked();
		expect(getByLabelText("HD")).toBeChecked();
		expect(queryByText("TV Only")).not.toBeInTheDocument();
		expect(getAllByRole("combobox")[0]).toHaveValue("movieAndCollection");
		expect(getByLabelText("Start search for missing movies")).not.toBeChecked();
	});

	it("requires a profile unless monitoring is disabled, then submits and closes", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		addMissingMoviesDialogMocks.addMissing.mutate.mockImplementation(
			(_payload: unknown, options?: { onSuccess?: () => void }) => {
				options?.onSuccess?.();
			},
		);

		const { getAllByRole, getByLabelText, getByRole } = renderWithProviders(
			<AddMissingMoviesDialog
				collection={{
					id: 2,
					missingMovies: 1,
					title: "Back to the Future",
				}}
				onOpenChange={onOpenChange}
				open
			/>,
		);

		await user.click(getByLabelText("4K"));
		await user.click(getByLabelText("HD"));
		expect(getByRole("button", { name: "Add 1 Movie" })).toBeDisabled();

		await user.selectOptions(getAllByRole("combobox")[0], "none");
		await user.click(getByLabelText("Start search for missing movies"));
		await user.click(getByRole("button", { name: "Add 1 Movie" }));

		expect(addMissingMoviesDialogMocks.addMissing.mutate).toHaveBeenCalledWith(
			{
				collectionId: 2,
				downloadProfileIds: [],
				minimumAvailability: "released",
				monitorOption: "none",
				searchOnAdd: true,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
