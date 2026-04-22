import type { ReactElement, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const importsRouteMocks = vi.hoisted(() => ({
	importSourcesQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
	sources: [
		{
			baseUrl: "http://localhost:8989",
			createdAt: new Date("2026-04-21T00:00:00.000Z"),
			hasApiKey: true,
			id: 1,
			kind: "sonarr",
			label: "Sonarr",
			lastSyncError: null,
			lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
			lastSyncStatus: "synced",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		},
	],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			importsRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/lib/admin-route", () => ({
	requireAdminBeforeLoad: ({
		context,
	}: {
		context: { session: { user: { role?: string | null } } };
	}) => {
		if (context.session.user.role !== "admin") {
			throw new Error("redirect:/");
		}
	},
}));

vi.mock("src/lib/queries", () => ({
	importSourcesQuery: importsRouteMocks.importSourcesQuery,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: ReactNode;
		title: string;
	}) => (
		<header data-testid="page-header">
			<h1>{title}</h1>
			{description ? <p>{description}</p> : null}
		</header>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	CardHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { Route } from "./imports";

describe("imports settings route", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		importsRouteMocks.importSourcesQuery.mockReturnValue({
			queryKey: ["imports", "sources"],
		});

		importsRouteMocks.useSuspenseQuery.mockReturnValue({
			data: importsRouteMocks.sources,
			status: "success",
		});
	});

	it("enforces admin access, loads sources, and renders the shell", async () => {
		const route = Route as unknown as {
			beforeLoad: (input: {
				context: { session: { user: { role?: string | null } } };
			}) => void;
			component: () => ReactElement;
			loader: (input: {
				context: {
					queryClient: { ensureQueryData: (query: unknown) => unknown };
				};
			}) => Promise<unknown>;
		};

		expect(() =>
			route.beforeLoad({
				context: { session: { user: { role: "member" } } },
			}),
		).toThrow("redirect:/");

		const ensureQueryData = vi.fn();
		await route.loader({
			context: { queryClient: { ensureQueryData } },
		});

		expect(importsRouteMocks.importSourcesQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["imports", "sources"] }),
		);

		const Component = route.component;
		await renderWithProviders(<Component />);

		await expect
			.element(page.getByRole("heading", { name: "Imports" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("heading", { name: "Sources" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Sonarr", { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Status: synced")).toBeInTheDocument();
		await expect
			.element(page.getByRole("heading", { name: "Plan" }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("heading", { name: "Review" }))
			.toBeInTheDocument();
	});
});
