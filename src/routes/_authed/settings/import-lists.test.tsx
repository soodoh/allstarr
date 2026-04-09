import { fireEvent, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

let activeTabsValue = "books";
let activeTabsSetValue: ((value: string) => void) | undefined;

const importListsRouteMocks = vi.hoisted(() => ({
	bookItems: [] as Array<{
		authorName: string;
		createdAt: string | null;
		id: number;
		title: string;
	}>,
	movieItems: [] as Array<{
		createdAt: string | null;
		id: number;
		title: string;
		year: number | null;
	}>,
	invalidateQueries: vi.fn(),
	queryClient: {
		invalidateQueries: vi.fn(),
	},
	removeBookImportExclusionFn: vi.fn(async () => undefined),
	removeMovieImportExclusionFn: vi.fn(async () => undefined),
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	useMutation: vi.fn(),
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQueryClient: () => importListsRouteMocks.queryClient,
		useMutation: (options: {
			mutationFn: (id: number) => Promise<unknown>;
			onError?: (error: unknown) => void;
			onSuccess?: (value: unknown) => void;
		}) => ({
			isPending: false,
			mutate: async (id: number) => {
				try {
					const result = await options.mutationFn(id);
					options.onSuccess?.(result);
				} catch (error) {
					options.onError?.(error);
				}
			},
		}),
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			importListsRouteMocks.useQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("sonner", () => ({
	toast: importListsRouteMocks.toast,
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		loading,
		onConfirm,
		open,
		title,
	}: {
		description: string;
		loading?: boolean;
		onConfirm?: () => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div data-testid="confirm-dialog">
				<h2>{title}</h2>
				<p>{description}</p>
				<div data-testid="confirm-loading">{String(Boolean(loading))}</div>
				<button type="button" onClick={() => onConfirm?.()}>
					confirm
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="empty-state">
			<div data-testid="empty-state-title">{title}</div>
			<div data-testid="empty-state-description">{description}</div>
		</div>
	),
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: ReactNode;
		title: string;
	}) => (
		<div data-testid="page-header">
			<h1>{title}</h1>
			{description ? <p>{description}</p> : null}
		</div>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type ?? "button"}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/table", () => ({
	Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
	TableBody: ({ children }: { children: ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
	TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
	TableHeader: ({ children }: { children: ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));

vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({
		children,
		defaultValue,
	}: {
		children: ReactNode;
		defaultValue: string;
	}) => {
		const [value, setValue] = useState(defaultValue);
		activeTabsValue = value;
		activeTabsSetValue = setValue;
		return (
			<div data-testid="tabs" data-value={value}>
				{children}
			</div>
		);
	},
	TabsContent: ({ children, value }: { children: ReactNode; value: string }) =>
		activeTabsValue === value ? <div>{children}</div> : null,
	TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) => (
		<button
			type="button"
			onClick={() => {
				activeTabsSetValue?.(value);
			}}
		>
			{children}
		</button>
	),
}));

vi.mock("src/lib/query-keys", () => ({
	queryKeys: {
		importExclusions: {
			books: () => ["import-exclusions", "books"],
			movies: () => ["import-exclusions", "movies"],
		},
	},
}));

vi.mock("src/server/import-list-exclusions", () => ({
	getBookImportExclusionsFn: (..._args: unknown[]) =>
		importListsRouteMocks.removeBookImportExclusionFn.mock.calls.length >= 0
			? Promise.resolve({ items: importListsRouteMocks.bookItems })
			: Promise.resolve({ items: [] }),
	getMovieImportExclusionsFn: (..._args: unknown[]) =>
		Promise.resolve({ items: importListsRouteMocks.movieItems }),
	removeBookImportExclusionFn: (...args: unknown[]) =>
		importListsRouteMocks.removeBookImportExclusionFn(...(args as [])),
	removeMovieImportExclusionFn: (...args: unknown[]) =>
		importListsRouteMocks.removeMovieImportExclusionFn(...(args as [])),
}));

import { Route } from "./import-lists";

const RouteComponent = Route as unknown as { component: () => ReactNode };

describe("import lists route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		activeTabsValue = "books";
		activeTabsSetValue = undefined;
		importListsRouteMocks.useQuery.mockImplementation(
			(query: { queryKey?: string[] }) => {
				if (query.queryKey?.[1] === "books") {
					return { data: { items: importListsRouteMocks.bookItems } };
				}
				return { data: { items: importListsRouteMocks.movieItems } };
			},
		);
		importListsRouteMocks.bookItems = [];
		importListsRouteMocks.movieItems = [];
	});

	it("shows the empty books tab", () => {
		renderWithProviders(<RouteComponent.component />);

		expect(screen.getByTestId("empty-state-title")).toHaveTextContent(
			"No exclusions",
		);
		expect(screen.getByTestId("empty-state-description")).toHaveTextContent(
			"Books excluded from import lists will appear here.",
		);
	});

	it("renders books and removes a book exclusion through the confirm dialog", async () => {
		importListsRouteMocks.bookItems = [
			{
				authorName: "Author One",
				createdAt: "2025-04-08T00:00:00.000Z",
				id: 1,
				title: "Book Import",
			},
		];

		renderWithProviders(<RouteComponent.component />);

		expect(screen.getByText("Book Import")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Remove" }));
		expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "confirm" }));

		await waitFor(() =>
			expect(
				importListsRouteMocks.removeBookImportExclusionFn,
			).toHaveBeenCalledWith({ data: { id: 1 } }),
		);
		expect(importListsRouteMocks.toast.success).toHaveBeenCalledWith(
			"Exclusion removed",
		);
	});
});
