import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		type,
	}: {
		children: ReactNode;
		onClick?: () => void;
		type?: "button";
	}) => (
		<button onClick={onClick} type={type ?? "button"}>
			{children}
		</button>
	),
}));

vi.mock("src/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
	resizeTmdbUrl: (url: string | null, size: string) => `resized:${url}:${size}`,
}));

vi.mock("./collection-movie-poster", () => ({
	default: ({
		movie,
		onAddMovie,
		onExclude,
	}: {
		movie: { title: string };
		onAddMovie: (movie: unknown) => void;
		onExclude: (movie: unknown) => void;
	}) => (
		<div>
			<div>poster:{movie.title}</div>
			<button onClick={() => onExclude(movie)} type="button">
				Exclude {movie.title}
			</button>
			<button onClick={() => onAddMovie(movie)} type="button">
				Add {movie.title}
			</button>
		</div>
	),
}));

import CollectionCard from "./collection-card";

const collection = {
	downloadProfileIds: [7],
	id: 1,
	minimumAvailability: "released",
	missingMovies: 2,
	monitored: true,
	movies: [
		{
			isExcluded: false,
			isExisting: true,
			movieId: 11,
			overview: "Ripley returns.",
			posterUrl: "/alien.jpg",
			title: "Alien",
			tmdbId: 101,
			year: 1979,
		},
		{
			isExcluded: false,
			isExisting: false,
			movieId: null,
			overview: "Deckard returns.",
			posterUrl: "/blade.jpg",
			title: "Blade Runner",
			tmdbId: 102,
			year: 1982,
		},
	],
	overview: "A science fiction collection",
	posterUrl: "/collection.jpg",
	title: "Sci-Fi Classics",
};

describe("CollectionCard", () => {
	it("renders the collection poster, metadata, and movie callbacks", async () => {
		const onAddMissing = vi.fn();
		const onAddMovie = vi.fn();
		const onEdit = vi.fn();
		const onExcludeMovie = vi.fn();
		const onToggleMonitor = vi.fn();

		const { container } = await renderWithProviders(
			<CollectionCard
				collection={collection}
				onAddMissing={onAddMissing}
				onAddMovie={onAddMovie}
				onEdit={onEdit}
				onExcludeMovie={onExcludeMovie}
				onToggleMonitor={onToggleMonitor}
			/>,
		);

		await expect.element(page.getByText("Sci-Fi Classics")).toBeInTheDocument();
		await expect.element(page.getByText("2 movies")).toBeInTheDocument();
		await expect.element(page.getByText("2 missing")).toBeInTheDocument();
		await expect
			.element(page.getByText("A science fiction collection"))
			.toBeInTheDocument();
		expect(
			container.querySelector('img[alt="Sci-Fi Classics"]'),
		).toHaveAttribute("src", "resized:/collection.jpg:w185");
		expect(container.querySelector('img[data-type="movie"]')).not.toBeNull();
		await expect.element(page.getByText("poster:Alien")).toBeInTheDocument();
		await expect
			.element(page.getByText("poster:Blade Runner"))
			.toBeInTheDocument();

		const buttons = page.getByRole("button");
		await buttons.nth(0).click();
		await buttons.nth(1).click();
		await page.getByText("Add Missing").click();
		await page.getByText("Exclude Alien").click();
		await page.getByText("Add Blade Runner").click();

		expect(onToggleMonitor).toHaveBeenCalledWith(collection);
		expect(onEdit).toHaveBeenCalledWith(collection);
		expect(onAddMissing).toHaveBeenCalledWith(collection);
		expect(onExcludeMovie).toHaveBeenCalledWith(collection.movies[0]);
		expect(onAddMovie).toHaveBeenCalledWith(collection.movies[1]);
	});

	it("hides optional content when the collection is complete and minimal", async () => {
		await renderWithProviders(
			<CollectionCard
				collection={{
					...collection,
					missingMovies: 0,
					monitored: false,
					movies: [collection.movies[0]],
					overview: "",
				}}
				onAddMissing={vi.fn()}
				onAddMovie={vi.fn()}
				onEdit={vi.fn()}
				onExcludeMovie={vi.fn()}
				onToggleMonitor={vi.fn()}
			/>,
		);

		await expect.element(page.getByText("Add Missing")).not.toBeInTheDocument();
		await expect
			.element(page.getByText("A science fiction collection"))
			.not.toBeInTheDocument();
		await expect.element(page.getByText("1 missing")).not.toBeInTheDocument();
		await expect.element(page.getByText("1 movie")).toBeInTheDocument();
	});
});
