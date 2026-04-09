import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("src/lib/utils", () => ({
	resizeTmdbUrl: (url: string | null, size: string) => `resized:${url}:${size}`,
}));

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
		const { getByText, queryByRole } = renderWithProviders(<Component />);

		expect(getByText("No upcoming shows")).toBeInTheDocument();
		expect(
			getByText("There are no currently airing or upcoming shows to display."),
		).toBeInTheDocument();
		expect(queryByRole("link")).toBeNull();
	});

	it("renders continuing and upcoming sections with formatted show metadata", () => {
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
		const { container, getAllByText, getByText, queryByText } =
			renderWithProviders(<Component />);

		expect(
			getByText("Currently airing and upcoming shows"),
		).toBeInTheDocument();
		expect(getByText("Currently Airing")).toBeInTheDocument();
		expect(getAllByText("Upcoming")).toHaveLength(2);
		expect(getByText("Severance")).toBeInTheDocument();
		expect(getByText("A Knight of the Seven Kingdoms")).toBeInTheDocument();
		expect(getByText("2025 · Apple TV+")).toBeInTheDocument();
		expect(getByText("TBA · HBO")).toBeInTheDocument();
		expect(getByText("Continuing")).toHaveClass("bg-green-600");
		expect(getAllByText("Upcoming")[1]).toHaveClass("bg-blue-600");
		expect(queryByText("Ended Show")).not.toBeInTheDocument();
		expect(container.querySelector('a[href="/tv/series/1"]')).not.toBeNull();
		expect(container.querySelector('a[href="/tv/series/2"]')).not.toBeNull();
		expect(container.querySelector('img[alt="Severance"]')).toHaveAttribute(
			"src",
			"resized:/severance.jpg:w154",
		);
		expect(
			container.querySelector('img[alt="A Knight of the Seven Kingdoms"]'),
		).toHaveAttribute("src", "resized:null:w154");
	});
});
