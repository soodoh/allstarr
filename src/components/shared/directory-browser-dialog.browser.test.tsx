import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: vi.fn(),
	};
});

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		open,
		onOpenChange,
	}: {
		children: ReactNode;
		open: boolean;
		onOpenChange?: (open: boolean) => void;
	}) => (
		<div>
			{open ? children : null}
			<button
				type="button"
				data-testid="dialog-open"
				onClick={() => onOpenChange?.(true)}
			/>
			<button
				type="button"
				data-testid="dialog-close"
				onClick={() => onOpenChange?.(false)}
			/>
		</div>
	),
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

	function TestHarness({ initialPath }: { initialPath?: string }) {
		const [open, setOpen] = useState(true);

		return (
			<DirectoryBrowserDialog
				initialPath={initialPath}
				onOpenChange={setOpen}
				onSelect={vi.fn()}
				open={open}
			/>
		);
	}

	it("disables fetching while closed", async () => {
		mockedUseQuery.mockReturnValue({
			data: undefined,
			error: null,
			isLoading: false,
		} as ReturnType<typeof useQuery>);

		await renderWithProviders(
			<DirectoryBrowserDialog
				onOpenChange={vi.fn()}
				onSelect={vi.fn()}
				open={false}
			/>,
		);

		await expect
			.poll(() => mockedUseQuery)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					enabled: false,
					queryKey: ["browse-directory", "/", true],
				}),
			);
	});

	it("renders loading and error states", async () => {
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

		const { container } = await renderWithProviders(
			<DirectoryBrowserDialog onOpenChange={vi.fn()} onSelect={vi.fn()} open />,
		);

		expect(container.querySelector(".animate-spin")).not.toBeNull();

		renderWithProviders(
			<DirectoryBrowserDialog onOpenChange={vi.fn()} onSelect={vi.fn()} open />,
		);

		await expect.element(page.getByText("No access")).toBeInTheDocument();
	});

	it("renders the fallback error message for non-Error failures", async () => {
		mockedUseQuery.mockReturnValue({
			data: undefined,
			error: "permission denied",
			isLoading: false,
		} as ReturnType<typeof useQuery>);

		renderWithProviders(
			<DirectoryBrowserDialog onOpenChange={vi.fn()} onSelect={vi.fn()} open />,
		);

		await expect
			.element(page.getByText("Failed to read directory"))
			.toBeInTheDocument();
	});

	it("starts from a custom initial path", async () => {
		mockedUseQuery.mockReturnValue({
			data: {
				current: "/mnt/media",
				directories: [],
				parent: null,
			},
			error: null,
			isLoading: false,
		} as ReturnType<typeof useQuery>);

		await renderWithProviders(
			<DirectoryBrowserDialog
				initialPath="/mnt/media"
				onOpenChange={vi.fn()}
				onSelect={vi.fn()}
				open
			/>,
		);

		await expect
			.poll(() => mockedUseQuery)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					queryKey: ["browse-directory", "/mnt/media", true],
				}),
			);
		await expect.element(page.getByText("/mnt/media")).toBeInTheDocument();
	});

	it("navigates directories, toggles hidden folders, and selects the displayed path", async () => {
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

		const { container } = await renderWithProviders(
			<DirectoryBrowserDialog
				onOpenChange={vi.fn()}
				onSelect={onSelect}
				open
			/>,
		);

		await page.getByRole("button", { name: "media" }).click();

		await expect.element(page.getByText("/media")).toBeInTheDocument();
		await expect
			.poll(() => mockedUseQuery)
			.toHaveBeenLastCalledWith(
				expect.objectContaining({
					queryKey: ["browse-directory", "/media", true],
				}),
			);

		await (
			container.querySelectorAll("button")[0] as HTMLButtonElement
		).click();

		await expect
			.poll(() => mockedUseQuery)
			.toHaveBeenLastCalledWith(
				expect.objectContaining({
					queryKey: ["browse-directory", "/media", false],
				}),
			);

		await page.getByRole("button", { name: "Select Folder" }).click();

		expect(onSelect).toHaveBeenCalledWith("/media");
	});

	it("renders parent navigation, empty state, and cancel action", async () => {
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

		renderWithProviders(
			<DirectoryBrowserDialog
				onOpenChange={onOpenChange}
				onSelect={vi.fn()}
				open
			/>,
		);

		await expect
			.element(page.getByText("No subdirectories found"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Cancel" }))
			.toBeInTheDocument();

		await page.getByRole("button", { name: ".." }).click();
		await expect
			.poll(() => mockedUseQuery)
			.toHaveBeenLastCalledWith(
				expect.objectContaining({
					queryKey: ["browse-directory", "/media", true],
				}),
			);

		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("resets the requested path when the dialog reopens", async () => {
		mockedUseQuery.mockImplementation((options) => {
			const [, path] = options.queryKey as [string, string, boolean];

			if (path === "/mnt/media") {
				return {
					data: {
						current: undefined,
						directories: [{ name: "media", path: "/media" }],
						parent: undefined,
					},
					error: null,
					isLoading: false,
				} as ReturnType<typeof useQuery>;
			}

			return {
				data: {
					current: "/media/library",
					directories: [],
					parent: "/",
				},
				error: null,
				isLoading: false,
			} as ReturnType<typeof useQuery>;
		});

		renderWithProviders(<TestHarness initialPath="/mnt/media" />);

		await page.getByRole("button", { name: "media" }).click();
		await expect.element(page.getByText("/media/library")).toBeInTheDocument();

		await page.getByTestId("dialog-close").click();
		await page.getByTestId("dialog-open").click();

		await expect
			.poll(() => mockedUseQuery)
			.toHaveBeenLastCalledWith(
				expect.objectContaining({
					queryKey: ["browse-directory", "/mnt/media", true],
				}),
			);
		await expect.element(page.getByText("/mnt/media")).toBeInTheDocument();
	});
});
