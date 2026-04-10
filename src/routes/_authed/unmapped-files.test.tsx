import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const unmappedFilesRouteMocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	rescanAllRootFoldersFn: vi.fn(),
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	unmappedFilesListQuery: vi.fn(() => ({
		queryKey: ["unmapped-files", "list"],
	})),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: unmappedFilesRouteMocks.invalidateQueries,
	})),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQueryClient: () => unmappedFilesRouteMocks.useQueryClient(),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("lucide-react", () => ({
	RefreshCw: ({ className }: { className?: string }) => (
		<span className={className}>Refresh</span>
	),
}));

vi.mock("sonner", () => ({
	toast: unmappedFilesRouteMocks.toast,
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	TableSkeleton: () => <div data-testid="table-skeleton" />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		actions,
		description,
		title,
	}: {
		actions?: ReactNode;
		description: string;
		title: string;
	}) => (
		<div data-testid="page-header">
			<div data-testid="page-header-title">{title}</div>
			<div data-testid="page-header-description">{description}</div>
			<div data-testid="page-header-actions">{actions}</div>
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

vi.mock("src/components/unmapped-files/unmapped-files-table", () => ({
	default: () => <div data-testid="unmapped-files-table" />,
}));

vi.mock("src/lib/queries", () => ({
	unmappedFilesListQuery: () =>
		unmappedFilesRouteMocks.unmappedFilesListQuery(),
}));

vi.mock("src/server/unmapped-files", () => ({
	rescanAllRootFoldersFn: () =>
		unmappedFilesRouteMocks.rescanAllRootFoldersFn(),
}));

import { Route } from "./unmapped-files";

describe("unmapped files route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		unmappedFilesRouteMocks.rescanAllRootFoldersFn.mockResolvedValue(undefined);
	});

	it("wires the loader and pending component", async () => {
		const ensureQueryData = vi.fn();
		const route = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
			pendingComponent: () => JSX.Element;
		};

		await route.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(
			unmappedFilesRouteMocks.unmappedFilesListQuery,
		).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["unmapped-files", "list"],
			}),
		);

		const Pending = route.pendingComponent;
		await renderWithProviders(<Pending />);
		await expect
			.element(page.getByTestId("table-skeleton"))
			.toBeInTheDocument();
	});

	it("rescans all root folders, invalidates the list query, and shows a success toast", async () => {
		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;
		await renderWithProviders(<Component />);

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Unmapped Files");
		await expect
			.element(page.getByTestId("unmapped-files-table"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: /Rescan All/i }).click();

		await expect
			.poll(() => unmappedFilesRouteMocks.rescanAllRootFoldersFn)
			.toHaveBeenCalledTimes(1);
		expect(unmappedFilesRouteMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["unmappedFiles"],
		});
		expect(unmappedFilesRouteMocks.toast.success).toHaveBeenCalledWith(
			"Rescan complete",
		);
		expect(unmappedFilesRouteMocks.toast.error).not.toHaveBeenCalled();
	});

	it("shows an error toast when rescanning fails", async () => {
		unmappedFilesRouteMocks.rescanAllRootFoldersFn.mockRejectedValueOnce(
			new Error("nope"),
		);

		const route = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = route.component;
		await renderWithProviders(<Component />);

		await page.getByRole("button", { name: /Rescan All/i }).click();

		await expect
			.poll(() => unmappedFilesRouteMocks.toast.error)
			.toHaveBeenCalledWith("Rescan failed");
	});
});
