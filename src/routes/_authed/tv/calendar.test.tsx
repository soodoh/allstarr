import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const tvCalendarMocks = vi.hoisted(() => ({
	showsListQuery: vi.fn(() => ({
		queryKey: ["shows", "list"],
	})),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			tvCalendarMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		params,
		to,
	}: {
		children: ReactNode;
		className?: string;
		params?: Record<string, string>;
		to: string;
	}) => (
		<a className={className} href={to.replace("$showId", params?.showId ?? "")}>
			{children}
		</a>
	),
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/shared/empty-state", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div>
			<div>{title}</div>
			<div>{description}</div>
		</div>
	),
}));

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({
		alt,
		src,
		type,
	}: {
		alt: string;
		src: string | null;
		type: string;
	}) => <img alt={alt} data-type={type} src={src ?? ""} />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({
		description,
		title,
	}: {
		description?: string;
		title: string;
	}) => (
		<div>
			<div>{title}</div>
			{description ? <div>{description}</div> : null}
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <span className={className}>{children}</span>,
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardHeader: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardTitle: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <h2 className={className}>{children}</h2>,
}));

vi.mock("src/lib/queries/shows", () => ({
	showsListQuery: () => tvCalendarMocks.showsListQuery(),
}));

vi.mock("src/lib/utils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("src/lib/utils")>();
	return {
		...actual,
		resizeTmdbUrl: (url: string | null, size: string) =>
			`resized:${url}:${size}`,
	};
});

import { Route } from "./calendar";

describe("tv calendar route", () => {
	beforeEach(() => {
		tvCalendarMocks.showsListQuery.mockClear();
		tvCalendarMocks.useSuspenseQuery.mockReset();
	});

	it("loads the shows query and renders the empty state when nothing is airing or upcoming", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(tvCalendarMocks.showsListQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["shows", "list"] }),
		);

		tvCalendarMocks.useSuspenseQuery.mockReturnValue({
			data: [
				{
					id: 1,
					network: "Apple TV+",
					posterUrl: "/ended.jpg",
					status: "ended",
					title: "Ended Show",
					year: 2024,
				},
			],
		});

		const Component = routeConfig.component;
		await renderWithProviders(<Component />);

		await expect
			.element(page.getByText("No upcoming shows"))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					"There are no currently airing or upcoming shows to display.",
				),
			)
			.toBeInTheDocument();
		expect(document.querySelectorAll("a").length).toBe(0);
	});

	it("renders continuing and upcoming sections with formatted show metadata", async () => {
		tvCalendarMocks.useSuspenseQuery.mockReturnValue({
			data: [
				{
					id: 1,
					network: "Apple TV+",
					posterUrl: "/severance.jpg",
					status: "continuing",
					title: "Severance",
					year: 2025,
				},
				{
					id: 2,
					network: "HBO",
					posterUrl: null,
					status: "upcoming",
					title: "A Knight of the Seven Kingdoms",
					year: 0,
				},
				{
					id: 3,
					network: "FX",
					posterUrl: "/ended.jpg",
					status: "ended",
					title: "Ended Show",
					year: 2024,
				},
			],
		});

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = routeConfig.component;
		await renderWithProviders(<Component />);

		await expect
			.element(page.getByText("Currently airing and upcoming shows"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("heading", { name: "Currently Airing" }))
			.toBeInTheDocument();
		const upcomingNodes = Array.from(document.querySelectorAll("*")).filter(
			(element) =>
				element.children.length === 0 && element.textContent === "Upcoming",
		);
		expect(upcomingNodes.length).toBeGreaterThanOrEqual(2);
		await expect.element(page.getByText("Severance")).toBeInTheDocument();
		await expect
			.element(page.getByText("A Knight of the Seven Kingdoms"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("2025 · Apple TV+"))
			.toBeInTheDocument();
		await expect.element(page.getByText("TBA · HBO")).toBeInTheDocument();
		await expect
			.element(page.getByText("Continuing"))
			.toHaveClass("bg-green-600");
		expect(upcomingNodes[1]).toHaveClass("bg-blue-600");
		await expect.element(page.getByText("Ended Show")).not.toBeInTheDocument();
		expect(document.querySelector('a[href="/tv/series/1"]')).not.toBeNull();
		expect(document.querySelector('a[href="/tv/series/2"]')).not.toBeNull();
		expect(document.querySelector('img[alt="Severance"]')).toHaveAttribute(
			"src",
			"resized:/severance.jpg:w154",
		);
		expect(
			document.querySelector('img[alt="A Knight of the Seven Kingdoms"]'),
		).toHaveAttribute("src", "resized:null:w154");
	});
});
