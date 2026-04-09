import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const movieCalendarMocks = vi.hoisted(() => ({
	moviesListQuery: vi.fn(() => ({
		queryKey: ["movies", "list"],
	})),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			movieCalendarMocks.useSuspenseQuery(...args),
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
		<a
			className={className}
			href={to.replace("$movieId", params?.movieId ?? "")}
		>
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

vi.mock("src/lib/queries/movies", () => ({
	moviesListQuery: () => movieCalendarMocks.moviesListQuery(),
}));

vi.mock("src/lib/utils", () => ({
	resizeTmdbUrl: (url: string | null, size: string) => `resized:${url}:${size}`,
}));

import { Route } from "./calendar";

describe("movies calendar route", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
		movieCalendarMocks.moviesListQuery.mockClear();
		movieCalendarMocks.useSuspenseQuery.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads the movies query and renders the empty state when no upcoming titles exist", async () => {
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

		expect(movieCalendarMocks.moviesListQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["movies", "list"] }),
		);

		movieCalendarMocks.useSuspenseQuery.mockReturnValue({
			data: [
				{
					id: 1,
					posterUrl: "/released.jpg",
					status: "released",
					title: "Released",
					year: 2024,
				},
			],
		});

		const Component = routeConfig.component;
		const { getByText, queryByRole } = renderWithProviders(<Component />);

		expect(getByText("No upcoming movies")).toBeInTheDocument();
		expect(
			getByText("There are no announced or in-cinemas movies to display."),
		).toBeInTheDocument();
		expect(queryByRole("link")).toBeNull();
	});

	it("groups announced and in-cinemas movies by year and shows poster/status metadata", () => {
		movieCalendarMocks.useSuspenseQuery.mockReturnValue({
			data: [
				{
					id: 1,
					posterUrl: "/future.jpg",
					status: "announced",
					title: "Future Movie",
					year: 2027,
				},
				{
					id: 2,
					posterUrl: null,
					status: "inCinemas",
					title: "Mystery Movie",
					year: 0,
				},
				{
					id: 3,
					posterUrl: "/released.jpg",
					status: "released",
					title: "Already Out",
					year: 2025,
				},
			],
		});

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const Component = routeConfig.component;
		const { container, getAllByText, getByText, queryByText } =
			renderWithProviders(<Component />);

		expect(getByText("Upcoming movie releases")).toBeInTheDocument();
		expect(getByText("2026")).toBeInTheDocument();
		expect(getAllByText("2027")).toHaveLength(2);
		expect(getByText("Future Movie")).toBeInTheDocument();
		expect(getByText("Mystery Movie")).toBeInTheDocument();
		expect(getByText("TBA")).toBeInTheDocument();
		expect(getByText("In Cinemas")).toHaveClass("bg-blue-600");
		expect(getByText("Announced")).toHaveClass("bg-yellow-600");
		expect(queryByText("Already Out")).not.toBeInTheDocument();
		expect(container.querySelector('a[href="/movies/1"]')).not.toBeNull();
		expect(container.querySelector('a[href="/movies/2"]')).not.toBeNull();
		expect(container.querySelector('img[alt="Future Movie"]')).toHaveAttribute(
			"src",
			"resized:/future.jpg:w154",
		);
		expect(container.querySelector('img[alt="Mystery Movie"]')).toHaveAttribute(
			"src",
			"resized:null:w154",
		);
	});
});
