import userEvent from "@testing-library/user-event";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

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
	default: ({
		contentType,
		fileIds,
		onClose,
	}: {
		contentType: string;
		fileIds: number[];
		onClose: () => void;
	}) => (
		<div data-testid="mapping-dialog">
			<p>{`mapping:${contentType}:${fileIds.join(",")}`}</p>
			<button onClick={onClose} type="button">
				Close mapping dialog
			</button>
		</div>
	),
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
		const user = userEvent.setup();
		tableMocks.state.groups = [];

		const { getByPlaceholderText, getByRole, getByTestId } =
			renderWithProviders(<UnmappedFilesTable />);

		expect(getByTestId("empty-state")).toHaveTextContent("No unmapped files");
		expect(getByPlaceholderText("Search files...")).toBeInTheDocument();
		expect(getByRole("button", { name: "Show Ignored" })).toBeInTheDocument();
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

		await user.click(getByRole("button", { name: "Show Ignored" }));

		expect(
			getByRole("button", { name: "Showing Ignored" }),
		).toBeInTheDocument();
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
		const user = userEvent.setup();
		tableMocks.state.groups = baseGroups;
		tableMocks.deleteUnmappedFilesFn.mockResolvedValue({ success: true });
		tableMocks.ignoreUnmappedFilesFn.mockResolvedValue({ success: true });
		tableMocks.rescanRootFolderFn.mockResolvedValue({ success: true });

		const {
			getAllByRole,
			getByPlaceholderText,
			getByRole,
			getByTestId,
			getByText,
			queryByText,
		} = renderWithProviders(<UnmappedFilesTable />);

		expect(getByText("/library/books")).toBeInTheDocument();
		expect(getByText("/library/movies")).toBeInTheDocument();
		expect(getByText("Books")).toBeInTheDocument();
		expect(getByText("Dune.epub")).toBeInTheDocument();
		expect(getByText('"Dune" by Frank Herbert (1965)')).toBeInTheDocument();
		expect(getByText("3.0 GB")).toBeInTheDocument();
		expect(getByText("epub")).toBeInTheDocument();
		expect(getByText("Alien (1979).mkv")).toBeInTheDocument();
		expect(getByText("2.0 GB")).toBeInTheDocument();
		expect(getByText("mkv")).toBeInTheDocument();
		expect(queryByText("Ignored Title.pdf")).not.toBeInTheDocument();

		await user.click(
			getAllByRole("button", { name: "Map to library entry" })[1],
		);

		expect(getByTestId("mapping-dialog")).toHaveTextContent("mapping:movie:3");
		await user.click(getByRole("button", { name: "Close mapping dialog" }));
		expect(queryByText("1 file selected")).not.toBeInTheDocument();

		await user.click(getAllByRole("checkbox")[1]);
		expect(getByText("1 file selected")).toBeInTheDocument();
		await user.click(getByRole("button", { name: "Map Selected" }));
		expect(getByTestId("mapping-dialog")).toHaveTextContent("mapping:ebook:1");
		await user.click(getByRole("button", { name: "Close mapping dialog" }));
		expect(queryByText("1 file selected")).not.toBeInTheDocument();

		await user.click(getAllByRole("button", { name: "Ignore" })[0]);
		expect(tableMocks.ignoreUnmappedFilesFn).toHaveBeenCalledWith({
			data: {
				ids: [1],
				ignored: true,
			},
		});
		expect(tableMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["unmappedFiles"],
		});
		expect(tableMocks.toast.success).toHaveBeenCalledWith("Files ignored");

		await user.click(getAllByRole("button", { name: "Delete file" })[0]);
		expect(getByTestId("confirm-dialog")).toHaveTextContent("Delete files");
		await user.click(getByRole("button", { name: "Confirm" }));
		expect(tableMocks.deleteUnmappedFilesFn).toHaveBeenCalledWith({
			data: {
				ids: [1],
			},
		});
		expect(tableMocks.toast.success).toHaveBeenCalledWith("1 file deleted");

		await user.click(getAllByRole("button", { name: "Rescan" })[0]);
		expect(tableMocks.rescanRootFolderFn).toHaveBeenCalledWith({
			data: {
				rootFolderPath: "/library/books",
			},
		});
		expect(tableMocks.toast.success).toHaveBeenCalledWith("Rescan complete");

		await user.click(getByRole("button", { name: "Show Ignored" }));
		expect(getByText("Ignored Title.pdf")).toBeInTheDocument();

		await user.click(getAllByRole("checkbox")[2]);
		expect(getByText("1 file selected")).toBeInTheDocument();
		await user.click(getByRole("button", { name: "Unignore Selected" }));
		expect(tableMocks.ignoreUnmappedFilesFn).toHaveBeenCalledWith({
			data: {
				ids: [2],
				ignored: false,
			},
		});
		expect(tableMocks.toast.success).toHaveBeenCalledWith("Files unignored");
		expect(queryByText("1 file selected")).not.toBeInTheDocument();

		await user.selectOptions(getByRole("combobox"), "movie");
		expect(queryByText("/library/books")).not.toBeInTheDocument();
		expect(getByText("/library/movies")).toBeInTheDocument();

		await user.type(getByPlaceholderText("Search files..."), "Alien");
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
		expect(getByText("Alien (1979).mkv")).toBeInTheDocument();
	});
});
