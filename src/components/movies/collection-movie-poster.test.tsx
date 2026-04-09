import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		params,
		to,
	}: {
		children: ReactNode;
		params?: Record<string, string>;
		to: string;
	}) => <a href={to.replace("$movieId", params?.movieId ?? "")}>{children}</a>,
}));

vi.mock("src/components/shared/optimized-image", () => ({
	default: ({
		alt,
		className,
		imageClassName,
		src,
		type,
	}: {
		alt: string;
		className?: string;
		imageClassName?: string;
		src: string | null;
		type: string;
	}) => (
		<img
			alt={alt}
			className={imageClassName ?? className}
			data-type={type}
			src={src ?? ""}
		/>
	),
}));

vi.mock("src/components/ui/context-menu", () => ({
	ContextMenu: ({ children }: { children: ReactNode }) => (
		<div data-testid="context-menu">{children}</div>
	),
	ContextMenuContent: ({ children }: { children: ReactNode }) => (
		<div data-testid="context-menu-content">{children}</div>
	),
	ContextMenuItem: ({
		children,
		onClick,
	}: {
		children: ReactNode;
		onClick?: () => void;
	}) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	ContextMenuTrigger: ({ children }: { children: ReactNode }) => (
		<div data-testid="context-menu-trigger">{children}</div>
	),
}));

vi.mock("src/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => (
		<div data-testid="tooltip">{children}</div>
	),
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<div data-testid="tooltip-content">{children}</div>
	),
	TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("src/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
	resizeTmdbUrl: (url: string | null, size: string) => `resized:${url}:${size}`,
}));

import CollectionMoviePoster from "./collection-movie-poster";

describe("CollectionMoviePoster", () => {
	it("links existing movies to their detail page", () => {
		const { container, getByAltText, getByText } = renderWithProviders(
			<CollectionMoviePoster
				movie={{
					isExcluded: false,
					isExisting: true,
					movieId: 12,
					overview: "Ripley returns.",
					posterUrl: "/alien.jpg",
					title: "Alien",
					tmdbId: 101,
					year: 1979,
				}}
			/>,
		);

		expect(getByAltText("Alien")).toHaveAttribute(
			"src",
			"resized:/alien.jpg:w154",
		);
		expect(getByText("Alien")).toBeInTheDocument();
		expect(container.querySelector('a[href="/movies/12"]')).not.toBeNull();
		expect(getByText("Alien")).toBeInTheDocument();
		expect(
			container.querySelector("[data-testid='tooltip-content']"),
		).toHaveTextContent("Alien");
	});

	it("adds missing movies and exposes the exclude action from the context menu", async () => {
		const user = userEvent.setup();
		const onAddMovie = vi.fn();
		const onExclude = vi.fn();

		const { getByRole, getByText } = renderWithProviders(
			<CollectionMoviePoster
				movie={{
					isExcluded: false,
					isExisting: false,
					movieId: null,
					overview: "Deckard returns.",
					posterUrl: "/blade.jpg",
					title: "Blade Runner",
					tmdbId: 102,
					year: 1982,
				}}
				onAddMovie={onAddMovie}
				onExclude={onExclude}
			/>,
		);

		await user.click(getByRole("button", { name: "Blade Runner" }));
		expect(onAddMovie).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Blade Runner" }),
		);
		await user.click(getByText("Exclude from import"));
		expect(onExclude).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Blade Runner" }),
		);
		expect(
			getByText("Blade Runner — Missing", { exact: false }),
		).toBeInTheDocument();
	});

	it("marks excluded movies and keeps them non-interactive", () => {
		const { container, getByAltText, getByText } = renderWithProviders(
			<CollectionMoviePoster
				movie={{
					isExcluded: true,
					isExisting: false,
					movieId: null,
					overview: "A hidden classic.",
					posterUrl: "/hidden.jpg",
					title: "Hidden Gem",
					tmdbId: 103,
					year: 1990,
				}}
			/>,
		);

		expect(getByAltText("Hidden Gem")).toHaveAttribute(
			"src",
			"resized:/hidden.jpg:w154",
		);
		expect(getByText("Hidden Gem — Excluded from import")).toBeInTheDocument();
		expect(container.querySelector(".grayscale")).not.toBeNull();
		expect(container.querySelector("button")).toBeNull();
	});
});
