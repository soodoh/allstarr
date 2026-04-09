import { useQuery } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: vi.fn(),
	};
});

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div>{children}</div> : null,
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

vi.mock("src/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("src/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	TooltipProvider: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("src/lib/queries", () => ({
	browseDirectoryQuery: (path: string, showHidden: boolean) => ({
		queryFn: vi.fn(),
		queryKey: ["browse-directory", path, showHidden],
	}),
}));

import DirectoryBrowserDialog from "./directory-browser-dialog";

const mockedUseQuery = vi.mocked(useQuery);

describe("DirectoryBrowserDialog", () => {
	afterEach(() => {
		mockedUseQuery.mockReset();
	});

	it("disables fetching while closed", () => {
		mockedUseQuery.mockReturnValue({
			data: undefined,
			error: null,
			isLoading: false,
		} as ReturnType<typeof useQuery>);

		renderWithProviders(
			<DirectoryBrowserDialog
				onOpenChange={vi.fn()}
				onSelect={vi.fn()}
				open={false}
			/>,
		);

		expect(mockedUseQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				enabled: false,
				queryKey: ["browse-directory", "/", true],
			}),
		);
	});

	it("renders loading and error states", () => {
		mockedUseQuery
			.mockReturnValueOnce({
				data: undefined,
				error: null,
				isLoading: true,
			} as ReturnType<typeof useQuery>)
			.mockReturnValueOnce({
				data: undefined,
				error: new Error("No access"),
				isLoading: false,
			} as ReturnType<typeof useQuery>);

		const loadingView = renderWithProviders(
			<DirectoryBrowserDialog onOpenChange={vi.fn()} onSelect={vi.fn()} open />,
		);

		expect(loadingView.container.querySelector(".animate-spin")).not.toBeNull();

		const errorView = renderWithProviders(
			<DirectoryBrowserDialog onOpenChange={vi.fn()} onSelect={vi.fn()} open />,
		);

		expect(errorView.getByText("No access")).toBeInTheDocument();
	});

	it("navigates directories, toggles hidden folders, and selects the displayed path", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();

		mockedUseQuery.mockImplementation((options) => {
			const [, path, showHidden] = options.queryKey as [
				string,
				string,
				boolean,
			];

			if (path === "/" && showHidden) {
				return {
					data: {
						current: "/",
						directories: [{ name: "media", path: "/media" }],
						parent: null,
					},
					error: null,
					isLoading: false,
				} as ReturnType<typeof useQuery>;
			}

			if (path === "/media" && showHidden) {
				return {
					data: {
						current: "/media",
						directories: [{ name: "books", path: "/media/books" }],
						parent: "/",
					},
					error: null,
					isLoading: false,
				} as ReturnType<typeof useQuery>;
			}

			return {
				data: {
					current: path,
					directories: [],
					parent: "/",
				},
				error: null,
				isLoading: false,
			} as ReturnType<typeof useQuery>;
		});

		const { container, getByRole, getByText } = renderWithProviders(
			<DirectoryBrowserDialog
				onOpenChange={vi.fn()}
				onSelect={onSelect}
				open
			/>,
		);

		await user.click(getByRole("button", { name: "media" }));

		expect(getByText("/media")).toBeInTheDocument();
		expect(mockedUseQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: ["browse-directory", "/media", true],
			}),
		);

		await user.click(
			container.querySelectorAll("button")[0] as HTMLButtonElement,
		);

		expect(mockedUseQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queryKey: ["browse-directory", "/media", false],
			}),
		);

		await user.click(getByRole("button", { name: "Select Folder" }));

		expect(onSelect).toHaveBeenCalledWith("/media");
	});

	it("renders parent navigation, empty state, and cancel action", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();

		mockedUseQuery.mockReturnValue({
			data: {
				current: "/media/books",
				directories: [],
				parent: "/media",
			},
			error: null,
			isLoading: false,
		} as ReturnType<typeof useQuery>);

		const { getByRole, getByText } = renderWithProviders(
			<DirectoryBrowserDialog
				onOpenChange={onOpenChange}
				onSelect={vi.fn()}
				open
			/>,
		);

		expect(getByText("No subdirectories found")).toBeInTheDocument();
		expect(getByRole("button", { name: "Cancel" })).toBeInTheDocument();

		await user.click(getByRole("button", { name: "Cancel" }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
