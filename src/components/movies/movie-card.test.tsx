import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		params,
		to,
	}: {
		children: React.ReactNode;
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

import MovieCard from "./movie-card";

describe("MovieCard", () => {
	it("renders poster metadata, file indicator, and the in-cinemas label", async () => {
		const { container } = await renderWithProviders(
			<MovieCard
				movie={{
					hasFile: true,
					id: 12,
					posterUrl: "/poster.jpg",
					status: "inCinemas",
					title: "Alien",
					year: 1979,
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("Alien poster"))
			.toHaveAttribute("src", "/poster.jpg");
		await expect
			.element(page.getByAltText("Alien poster"))
			.toHaveAttribute("data-type", "movie");
		await expect.element(page.getByText("Alien")).toBeInTheDocument();
		await expect.element(page.getByText("1979")).toBeInTheDocument();
		await expect
			.element(page.getByText("In Cinemas"))
			.toHaveClass("bg-blue-600");
		expect(container.querySelector('a[href="/movies/12"]')).not.toBeNull();
		expect(container.querySelector('[title="On disk"]')).not.toBeNull();
	});

	it("falls back to the default status styling and hides empty year/file data", async () => {
		const { container } = await renderWithProviders(
			<MovieCard
				movie={{
					hasFile: false,
					id: 7,
					posterUrl: "",
					status: "tba",
					title: "Blade Runner",
					year: 0,
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("Blade Runner poster"))
			.not.toHaveAttribute("src");
		await expect.element(page.getByText("TBA")).toHaveClass("bg-zinc-600");
		await expect.element(page.getByText("0")).not.toBeInTheDocument();
		expect(container.querySelector('[title="On disk"]')).toBeNull();
	});

	it("uses the default label branch for unknown statuses", async () => {
		await renderWithProviders(
			<MovieCard
				movie={{
					hasFile: false,
					id: 99,
					posterUrl: "/mystery.jpg",
					status: "archived",
					title: "Mystery Movie",
					year: 2001,
				}}
			/>,
		);

		await expect.element(page.getByText("Archived")).toHaveClass("bg-zinc-600");
	});
});
