import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const addBooksRouteMocks = vi.hoisted(() => ({
	searchHardcoverFn: vi.fn(
		async ({
			data,
		}: {
			data: { limit: number; query: string; type: string };
		}) => ({
			query: data.query,
			results: [
				{
					coverUrl: null,
					description: "A spice-fueled epic.",
					id: 1,
					releaseYear: 1965,
					slug: "dune",
					subtitle: "Book one",
					title: "Dune",
					type: "book",
				},
				{
					coverUrl: null,
					description: "Writer of Dune.",
					id: 2,
					releaseYear: 1920,
					slug: "frank-herbert",
					subtitle: "Science fiction author",
					title: "Frank Herbert",
					type: "author",
				},
			],
		}),
	),
	settingsQuery: vi.fn((tableId: string) => ({
		queryFn: async () => ({ addDefaults: { monitored: true } }),
		queryKey: ["user-settings", tableId],
	})),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("lucide-react", () => ({
	Search: ({ className }: { className?: string }) => (
		<span className={className}>Search</span>
	),
}));

vi.mock("src/components/bookshelf/hardcover/author-preview-modal", () => ({
	default: ({
		author,
		open,
		onOpenChange,
	}: {
		author: { title: string };
		onOpenChange: (open: boolean) => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="author-preview-modal">
				<span>{author.title}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					close
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/bookshelf/hardcover/book-preview-modal", () => ({
	default: ({
		book,
		open,
		onOpenChange,
	}: {
		book: { title: string };
		onOpenChange: (open: boolean) => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="book-preview-modal">
				<span>{book.title}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					close
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="empty-state">
			<span data-testid="empty-state-title">{title}</span>
			<span data-testid="empty-state-description">{description}</span>
		</div>
	),
}));

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({ alt }: { alt: string }) => <img alt={alt} />,
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
			<span data-testid="page-header-title">{title}</span>
			{description ? <span>{description}</span> : null}
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children, variant }: { children: ReactNode; variant?: string }) => (
		<span data-variant={variant}>{children}</span>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		type,
	}: {
		children: ReactNode;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button
			data-type={type ?? "button"}
			onClick={onClick}
			type={type ?? "button"}
		>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({
		children,
		className,
		onClick,
	}: {
		children: ReactNode;
		className?: string;
		onClick?: () => void;
	}) => (
		<div className={className} data-onclick={String(Boolean(onClick))}>
			{children}
		</div>
	),
	CardContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		onChange,
		placeholder,
		value,
	}: {
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => (
		<input
			aria-label="Search query"
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	),
}));

vi.mock("src/components/ui/tabs", async () => {
	const React = await import("react");
	const TabsContext = React.createContext<{
		onValueChange?: (value: string) => void;
		value: string;
	}>({ value: "all" });

	return {
		Tabs: ({
			children,
			onValueChange,
			value,
		}: {
			children: ReactNode;
			onValueChange?: (value: string) => void;
			value: string;
		}) => (
			<TabsContext.Provider value={{ onValueChange, value }}>
				<div>{children}</div>
			</TabsContext.Provider>
		),
		TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		TabsTrigger: ({
			children,
			value,
		}: {
			children: ReactNode;
			value: string;
		}) => {
			const context = React.useContext(TabsContext);
			return (
				<button onClick={() => context.onValueChange?.(value)} type="button">
					{children}
				</button>
			);
		},
	};
});

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) =>
		addBooksRouteMocks.settingsQuery(tableId),
}));

vi.mock("src/server/search", () => ({
	searchHardcoverFn: (
		...args: Parameters<typeof addBooksRouteMocks.searchHardcoverFn>
	) => addBooksRouteMocks.searchHardcoverFn(...args),
}));

import { Route } from "./add";

describe("AddBooksRoute", () => {
	beforeEach(() => {
		addBooksRouteMocks.searchHardcoverFn.mockClear();
		addBooksRouteMocks.settingsQuery.mockClear();
	});

	it("wires the loader to the books settings query", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown>;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(addBooksRouteMocks.settingsQuery).toHaveBeenCalledWith("books");
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["user-settings", "books"],
			}),
		);
	});

	it("validates short searches and renders Hardcover search results", async () => {
		const routeConfig = Route as unknown as {
			component: () => ReactNode;
		};
		const Component = routeConfig.component;

		await renderWithProviders(<Component />);

		await expect
			.element(page.getByTestId("page-header-title"))
			.toHaveTextContent("Add to Bookshelf");
		await expect
			.element(page.getByTestId("empty-state-title"))
			.toHaveTextContent("Search to add");

		await page.getByLabelText("Search query").fill("a");
		const searchInput = document.querySelector(
			'[aria-label="Search query"]',
		) as HTMLInputElement;
		const searchForm = searchInput.closest("form");
		if (!searchForm) {
			throw new Error("expected search form");
		}
		searchForm.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
		await expect
			.element(page.getByText("Enter at least 2 characters."))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Books" }).click();
		await expect
			.element(page.getByLabelText("Search query"))
			.toHaveAttribute("placeholder", "Search only books");

		await page.getByLabelText("Search query").fill(" dune ");
		searchForm.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);

		await expect
			.poll(() => addBooksRouteMocks.searchHardcoverFn)
			.toHaveBeenCalledWith({
				data: {
					limit: 20,
					query: "dune",
					type: "books",
				},
			});

		await expect
			.element(page.getByText(/Showing 2 results for/))
			.toBeInTheDocument();

		await page.getByRole("heading", { name: "Dune" }).click();
		await expect
			.element(page.getByTestId("book-preview-modal"))
			.toHaveTextContent("Dune");

		await page.getByRole("heading", { name: "Frank Herbert" }).click();
		await expect
			.element(page.getByTestId("author-preview-modal"))
			.toHaveTextContent("Frank Herbert");
	});
});
