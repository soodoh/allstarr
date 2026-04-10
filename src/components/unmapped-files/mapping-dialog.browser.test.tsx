import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

const mappingDialogState = vi.hoisted(() => ({
	profiles: [] as Array<{
		contentType: string;
		id: number;
		name: string;
	}>,
	results: [] as Array<{
		entityType: "book" | "movie" | "episode";
		id: number;
		subtitle: string;
		title: string;
	}>,
	loading: false,
}));

const mappingDialogMocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	mapUnmappedFileFn: vi.fn(),
	searchLibraryFn: vi.fn(),
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	useDebounce: vi.fn((value: string) => value),
	useQuery: vi.fn((options: { queryKey?: unknown }) => {
		const queryKey = Array.isArray(options.queryKey) ? options.queryKey : [];

		if (queryKey[0] === "downloadProfiles") {
			return {
				data: mappingDialogState.profiles,
			};
		}

		if (queryKey[0] === "unmappedFiles" && queryKey[1] === "search") {
			return {
				data: {
					library: mappingDialogState.results,
				},
				isLoading: mappingDialogState.loading,
			};
		}

		return {
			data: undefined,
			isLoading: false,
		};
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mappingDialogMocks.invalidateQueries,
	})),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (options: { queryKey?: unknown }) =>
			mappingDialogMocks.useQuery(options),
		useQueryClient: () => mappingDialogMocks.useQueryClient(),
	};
});

vi.mock("sonner", () => ({
	toast: mappingDialogMocks.toast,
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

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		onOpenChange,
		open,
	}: {
		children: ReactNode;
		onOpenChange?: (open: boolean) => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="dialog" data-on-open-change={Boolean(onOpenChange)}>
				{children}
			</div>
		) : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({ onChange, ...props }: ComponentPropsWithoutRef<"input">) => (
		<input {...props} onChange={(event) => onChange?.(event)} type="text" />
	),
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
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: () => null,
}));

vi.mock("src/hooks/use-debounce", () => ({
	useDebounce: (value: string) => mappingDialogMocks.useDebounce(value),
}));

vi.mock("src/lib/queries/download-profiles", () => ({
	downloadProfilesListQuery: () => ({
		queryKey: ["downloadProfiles", "list"],
	}),
}));

vi.mock("src/server/unmapped-files", () => ({
	mapUnmappedFileFn: (...args: unknown[]) =>
		mappingDialogMocks.mapUnmappedFileFn(...args),
	searchLibraryFn: (...args: unknown[]) =>
		mappingDialogMocks.searchLibraryFn(...args),
}));

import MappingDialog from "./mapping-dialog";

describe("MappingDialog", () => {
	afterEach(() => {
		vi.clearAllMocks();
		mappingDialogState.profiles = [];
		mappingDialogState.results = [];
		mappingDialogState.loading = false;
	});

	it("maps a search result with the hinted search text and selected profile", async () => {
		const onClose = vi.fn();

		mappingDialogState.profiles = [
			{ contentType: "movie", id: 7, name: "Movies 4K" },
			{ contentType: "tv", id: 8, name: "TV Only" },
		];
		mappingDialogState.results = [
			{
				entityType: "movie",
				id: 501,
				subtitle: "1979",
				title: "Alien",
			},
		];
		mappingDialogMocks.mapUnmappedFileFn.mockResolvedValue({
			mappedCount: 2,
			success: true,
		});

		await renderWithProviders(
			<MappingDialog
				contentType="movie"
				fileIds={[11, 12]}
				hints={{ author: "Ridley Scott", title: "Alien" }}
				onClose={onClose}
			/>,
		);

		await expect
			.element(page.getByRole("heading", { name: "Map 2 files" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByLabelText("Search Library"))
			.toHaveValue("Alien Ridley Scott");
		await expect.element(page.getByRole("combobox")).toHaveValue("7");
		await expect.element(page.getByText("Alien")).toBeInTheDocument();
		await expect.element(page.getByText("1979")).toBeInTheDocument();

		await page.getByRole("button", { name: "Map Here" }).click();

		expect(mappingDialogMocks.mapUnmappedFileFn).toHaveBeenCalledWith({
			data: {
				downloadProfileId: 7,
				entityId: 501,
				entityType: "movie",
				unmappedFileIds: [11, 12],
			},
		});
		expect(mappingDialogMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["unmappedFiles"],
		});
		expect(mappingDialogMocks.toast.success).toHaveBeenCalledWith(
			'2 files mapped to "Alien"',
		);
		expect(mappingDialogMocks.toast.error).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("shows the profile fallback and no-results state when nothing matches", async () => {
		mappingDialogState.profiles = [
			{ contentType: "movie", id: 9, name: "Movies" },
		];

		await renderWithProviders(
			<MappingDialog
				contentType="tv"
				fileIds={[42]}
				hints={null}
				onClose={vi.fn()}
			/>,
		);

		await expect
			.element(
				page.getByText(
					"No tv profiles available. Create one in Settings > Profiles.",
				),
			)
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Type at least 2 characters to search"))
			.toBeInTheDocument();

		await userEvent.type(page.getByLabelText("Search Library"), "ab");

		await expect
			.element(page.getByText("No results found in your library"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Map Here" }))
			.not.toBeInTheDocument();
	});
});
