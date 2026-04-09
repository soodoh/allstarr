import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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
		const user = userEvent.setup();
		const onAddMissing = vi.fn();
		const onAddMovie = vi.fn();
		const onEdit = vi.fn();
		const onExcludeMovie = vi.fn();
		const onToggleMonitor = vi.fn();

		const { container, getAllByRole, getByText } = renderWithProviders(
			<CollectionCard
				collection={collection}
				onAddMissing={onAddMissing}
				onAddMovie={onAddMovie}
				onEdit={onEdit}
				onExcludeMovie={onExcludeMovie}
				onToggleMonitor={onToggleMonitor}
			/>,
		);

		expect(getByText("Sci-Fi Classics")).toBeInTheDocument();
		expect(getByText("2 movies")).toBeInTheDocument();
		expect(container).toHaveTextContent("2 missing");
		expect(getByText("A science fiction collection")).toBeInTheDocument();
		expect(
			container.querySelector('img[alt="Sci-Fi Classics"]'),
		).toHaveAttribute("src", "resized:/collection.jpg:w185");
		expect(container.querySelector('img[data-type="movie"]')).not.toBeNull();
		expect(getByText("poster:Alien")).toBeInTheDocument();
		expect(getByText("poster:Blade Runner")).toBeInTheDocument();

		const buttons = getAllByRole("button");
		await user.click(buttons[0] as HTMLButtonElement);
		await user.click(buttons[1] as HTMLButtonElement);
		await user.click(getByText("Add Missing"));
		await user.click(getByText("Exclude Alien"));
		await user.click(getByText("Add Blade Runner"));

		expect(onToggleMonitor).toHaveBeenCalledWith(collection);
		expect(onEdit).toHaveBeenCalledWith(collection);
		expect(onAddMissing).toHaveBeenCalledWith(collection);
		expect(onExcludeMovie).toHaveBeenCalledWith(collection.movies[0]);
		expect(onAddMovie).toHaveBeenCalledWith(collection.movies[1]);
	});

	it("hides optional content when the collection is complete and minimal", () => {
		const { queryByText } = renderWithProviders(
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

		expect(queryByText("Add Missing")).not.toBeInTheDocument();
		expect(queryByText("A science fiction collection")).not.toBeInTheDocument();
		expect(queryByText("1 missing")).not.toBeInTheDocument();
		expect(queryByText("1 movie")).toBeInTheDocument();
	});
});
