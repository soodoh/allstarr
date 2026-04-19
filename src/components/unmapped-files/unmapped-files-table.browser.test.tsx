import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

type UnmappedFile = {
	contentType: string;
	format: string;
	hints: {
		author?: string;
		episode?: number;
		season?: number;
		source?: "filename" | "path" | "metadata";
		title?: string;
		year?: number;
	};
	id: number;
	ignored: boolean;
	path: string;
	rootFolderPath: string;
	size: number;
};

type MappingDialogFile = {
	id: number;
	path: string;
	hints: UnmappedFile["hints"] | null;
};

type UnmappedGroup = {
	contentType: string;
	files: UnmappedFile[];
	profileName: string | null;
	rootFolderPath: string;
};

const baseGroups: UnmappedGroup[] = [
	{
		contentType: "ebook",
		profileName: "Books",
		rootFolderPath: "/library/books",
		files: [
			{
				contentType: "ebook",
				format: "epub",
				hints: {
					author: "Frank Herbert",
					title: "Dune",
					year: 1965,
				},
				id: 1,
				ignored: false,
				path: "/library/books/Dune.epub",
				rootFolderPath: "/library/books",
				size: 3 * 1024 * 1024 * 1024,
			},
			{
				contentType: "ebook",
				format: "pdf",
				hints: {
					title: "Ignored Title",
				},
				id: 2,
				ignored: true,
				path: "/library/books/Ignored Title.pdf",
				rootFolderPath: "/library/books",
				size: 512 * 1024 * 1024,
			},
		],
	},
	{
		contentType: "movie",
		profileName: null,
		rootFolderPath: "/library/movies",
		files: [
			{
				contentType: "movie",
				format: "mkv",
				hints: {
					title: "Alien",
					year: 1979,
				},
				id: 3,
				ignored: false,
				path: "/library/movies/Alien (1979).mkv",
				rootFolderPath: "/library/movies",
				size: 2 * 1024 * 1024 * 1024,
			},
		],
	},
];

function filterGroups(
	groups: UnmappedGroup[],
	params: {
		contentType?: string;
		search?: string;
		showIgnored?: boolean;
	},
): UnmappedGroup[] {
	const search = params.search?.toLowerCase();

	return groups
		.map((group) => ({
			...group,
			files: group.files.filter((file) => {
				if (!params.showIgnored && file.ignored) return false;
				if (params.contentType && group.contentType !== params.contentType) {
					return false;
				}
				if (search && !file.path.toLowerCase().includes(search)) {
					return false;
				}
				return true;
			}),
		}))
		.filter((group) => group.files.length > 0);
}

const tableMocks = vi.hoisted(() => ({
	deleteUnmappedFilesFn: vi.fn(),
	ignoreUnmappedFilesFn: vi.fn(),
	invalidateQueries: vi.fn(),
	rescanRootFolderFn: vi.fn(),
	state: {
		groups: [] as UnmappedGroup[],
	},
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	useQuery: vi.fn((options: { queryKey?: unknown }) => {
		const queryKey = Array.isArray(options.queryKey) ? options.queryKey : [];
		const params = (queryKey[2] ?? {}) as {
			contentType?: string;
			search?: string;
			showIgnored?: boolean;
		};

		return {
			data: filterGroups(tableMocks.state.groups, params),
		};
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: tableMocks.invalidateQueries,
	})),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (options: { queryKey?: unknown }) => tableMocks.useQuery(options),
		useQueryClient: () => tableMocks.useQueryClient(),
	};
});

vi.mock("sonner", () => ({
	toast: tableMocks.toast,
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		description: string;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<p>{title}</p>
				<p>{description}</p>
				<button onClick={onConfirm} type="button">
					Confirm
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Close
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="empty-state">
			<p>{title}</p>
			<p>{description}</p>
		</div>
	),
}));

vi.mock("src/components/unmapped-files/mapping-dialog", () => ({
	default: (props: {
		files?: MappingDialogFile[];
		contentType: string;
		fileIds?: number[];
		onClose: () => void;
	}) => {
		const hasFilesProp = Object.hasOwn(props, "files");
		if (hasFilesProp && !Array.isArray(props.files)) {
			throw new Error("files prop must be omitted when not used");
		}

		const { contentType, fileIds, files, onClose } = props;
		const mappingIds = fileIds ?? files?.map((file) => file.id) ?? [];

		return (
			<div data-testid="mapping-dialog">
				<p>{`mapping:${contentType}:${mappingIds.join(",")}`}</p>
				<p>{`files:${JSON.stringify(files ?? [])}`}</p>
				<button onClick={onClose} type="button">
					Close mapping dialog
				</button>
			</div>
		);
	},
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		title,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		title?: string;
	}) => (
		<button disabled={disabled} onClick={onClick} title={title} type="button">
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: () => void;
	}) => (
		<input
			aria-label="checkbox"
			checked={Boolean(checked)}
			onChange={() => onCheckedChange?.()}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/input", () => ({
	default: ({ onChange, ...props }: ComponentPropsWithoutRef<"input">) => (
		<input {...props} onChange={(event) => onChange?.(event)} type="text" />
	),
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

vi.mock("src/lib/queries", () => ({
	unmappedFilesListQuery: (params: {
		contentType?: string;
		search?: string;
		showIgnored?: boolean;
	}) => ({
		queryKey: ["unmappedFiles", "list", params],
	}),
}));

vi.mock("src/server/unmapped-files", () => ({
	deleteUnmappedFilesFn: (...args: unknown[]) =>
		tableMocks.deleteUnmappedFilesFn(...args),
	ignoreUnmappedFilesFn: (...args: unknown[]) =>
		tableMocks.ignoreUnmappedFilesFn(...args),
	rescanRootFolderFn: (...args: unknown[]) =>
		tableMocks.rescanRootFolderFn(...args),
}));

import UnmappedFilesTable from "./unmapped-files-table";

describe("UnmappedFilesTable", () => {
	afterEach(() => {
		vi.clearAllMocks();
		tableMocks.state.groups = [];
	});

	it("shows the empty state and keeps the toolbar wired to the query params", async () => {
		tableMocks.state.groups = [];

		await renderWithProviders(<UnmappedFilesTable />);

		await expect
			.element(page.getByTestId("empty-state"))
			.toHaveTextContent("No unmapped files");
		await expect.element(page.getByRole("textbox")).toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Show Ignored" }))
			.toBeInTheDocument();
		expect(tableMocks.useQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: [
					"unmappedFiles",
					"list",
					{
						contentType: undefined,
						search: undefined,
						showIgnored: false,
					},
				],
			}),
		);

		await page.getByRole("button", { name: "Show Ignored" }).click();

		await expect
			.element(page.getByRole("button", { name: "Showing Ignored" }))
			.toBeInTheDocument();
		expect(tableMocks.useQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: [
					"unmappedFiles",
					"list",
					{
						contentType: undefined,
						search: undefined,
						showIgnored: true,
					},
				],
			}),
		);
	});

	it("drives row actions, bulk actions, and toolbar filters from the table state", async () => {
		tableMocks.state.groups = baseGroups;
		tableMocks.deleteUnmappedFilesFn.mockResolvedValue({ success: true });
		tableMocks.ignoreUnmappedFilesFn.mockResolvedValue({ success: true });
		tableMocks.rescanRootFolderFn.mockResolvedValue({ success: true });

		await renderWithProviders(<UnmappedFilesTable />);

		await expect
			.element(page.getByText("/library/books", { exact: true }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("/library/movies", { exact: true }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Dune.epub", { exact: true }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText('"Dune" by Frank Herbert (1965)'))
			.toBeInTheDocument();
		await expect.element(page.getByText("3.0 GB")).toBeInTheDocument();
		await expect
			.element(page.getByText("epub", { exact: true }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Alien (1979).mkv", { exact: true }).first())
			.toBeInTheDocument();
		await expect.element(page.getByText("2.0 GB")).toBeInTheDocument();
		await expect
			.element(page.getByText("mkv", { exact: true }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Ignored Title.pdf", { exact: true }))
			.not.toBeInTheDocument();

		await page.getByTitle("Map to library entry").nth(1).click();

		await expect
			.element(page.getByTestId("mapping-dialog"))
			.toHaveTextContent("mapping:movie:3");
		await page.getByRole("button", { name: "Close mapping dialog" }).click();
		await expect
			.element(page.getByText("1 file selected"))
			.not.toBeInTheDocument();

		await page.getByRole("checkbox", { name: "checkbox" }).nth(1).click();
		await expect.element(page.getByText("1 file selected")).toBeInTheDocument();
		await page.getByRole("button", { name: "Map Selected" }).click();
		await expect
			.element(page.getByTestId("mapping-dialog"))
			.toHaveTextContent("mapping:ebook:1");
		await page.getByRole("button", { name: "Close mapping dialog" }).click();
		await expect
			.element(page.getByText("1 file selected"))
			.not.toBeInTheDocument();

		await page.getByTitle("Ignore").first().click();
		await expect
			.poll(() => tableMocks.ignoreUnmappedFilesFn.mock.calls)
			.toContainEqual([
				{
					data: {
						ids: [1],
						ignored: true,
					},
				},
			]);
		await expect
			.poll(() => tableMocks.toast.success.mock.calls)
			.toContainEqual(["Files ignored"]);

		await page.getByTitle("Delete file").first().click();
		await expect
			.element(page.getByTestId("confirm-dialog"))
			.toHaveTextContent("Delete files");
		await page.getByRole("button", { name: "Confirm" }).click();
		await expect
			.poll(() => tableMocks.deleteUnmappedFilesFn.mock.calls)
			.toContainEqual([{ data: { ids: [1] } }]);
		await expect
			.poll(() => tableMocks.toast.success.mock.calls)
			.toContainEqual(["1 file deleted"]);

		await page.getByRole("button", { name: "Rescan" }).first().click();
		await expect
			.poll(() => tableMocks.rescanRootFolderFn.mock.calls)
			.toContainEqual([{ data: { rootFolderPath: "/library/books" } }]);
		await expect
			.poll(() => tableMocks.toast.success.mock.calls)
			.toContainEqual(["Rescan complete"]);

		await page.getByRole("button", { name: "Show Ignored" }).click();
		await expect
			.element(page.getByText("Ignored Title.pdf", { exact: true }).first())
			.toBeInTheDocument();

		await page.getByRole("checkbox", { name: "checkbox" }).nth(2).click();
		await expect.element(page.getByText("1 file selected")).toBeInTheDocument();
		await page.getByRole("button", { name: "Unignore Selected" }).click();
		await expect
			.poll(() => tableMocks.ignoreUnmappedFilesFn.mock.calls)
			.toContainEqual([{ data: { ids: [2], ignored: false } }]);
		await expect
			.poll(() => tableMocks.toast.success.mock.calls)
			.toContainEqual(["Files unignored"]);
		await expect
			.element(page.getByText("1 file selected"))
			.not.toBeInTheDocument();

		await userEvent.selectOptions(page.getByRole("combobox"), "movie");
		await expect
			.element(page.getByText("/library/books", { exact: true }).first())
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("/library/movies", { exact: true }).first())
			.toBeInTheDocument();

		await userEvent.type(page.getByRole("textbox"), "Alien");
		expect(tableMocks.useQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: [
					"unmappedFiles",
					"list",
					{
						contentType: "movie",
						search: "Alien",
						showIgnored: true,
					},
				],
			}),
		);
		await expect
			.element(page.getByText("Alien (1979).mkv", { exact: true }).first())
			.toBeInTheDocument();
	});

	it("passes individual TV file rows into the mapping dialog for single and bulk launches", async () => {
		tableMocks.state.groups = [
			{
				contentType: "tv",
				profileName: "TV",
				rootFolderPath: "/library/tv",
				files: [
					{
						contentType: "tv",
						format: "mkv",
						hints: {
							episode: 1,
							season: 1,
							title: "Pilot",
						},
						id: 4,
						ignored: false,
						path: "/library/tv/Show.S01E01.mkv",
						rootFolderPath: "/library/tv",
						size: 4 * 1024 * 1024 * 1024,
					},
					{
						contentType: "tv",
						format: "mkv",
						hints: {
							episode: 2,
							season: 1,
							title: "Second Episode",
						},
						id: 5,
						ignored: false,
						path: "/library/tv/Show.S01E02.mkv",
						rootFolderPath: "/library/tv",
						size: 4 * 1024 * 1024 * 1024,
					},
				],
			},
		];

		await renderWithProviders(<UnmappedFilesTable />);

		await page.getByTitle("Map to library entry").first().click();
		await expect
			.element(page.getByTestId("mapping-dialog"))
			.toHaveTextContent(
				'files:[{"hints":{"episode":1,"season":1,"title":"Pilot"},"id":4,"path":"/library/tv/Show.S01E01.mkv"}]',
			);
		await page.getByRole("button", { name: "Close mapping dialog" }).click();

		await page.getByRole("checkbox", { name: "checkbox" }).nth(1).click();
		await page.getByRole("checkbox", { name: "checkbox" }).nth(2).click();
		await expect
			.element(page.getByText("2 files selected"))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Map Selected" }).click();
		await expect
			.element(page.getByTestId("mapping-dialog"))
			.toHaveTextContent(
				'files:[{"hints":{"episode":1,"season":1,"title":"Pilot"},"id":4,"path":"/library/tv/Show.S01E01.mkv"},{"hints":{"episode":2,"season":1,"title":"Second Episode"},"id":5,"path":"/library/tv/Show.S01E02.mkv"}]',
			);
	});
});
