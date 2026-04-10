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
		<a className={className} href={to.replace("$showId", params?.showId ?? "")}>
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

import ShowCard from "./show-card";

describe("ShowCard", () => {
	it("renders episode progress, year, and the continuing badge", async () => {
		const { container } = await renderWithProviders(
			<ShowCard
				show={{
					episodeCount: 24,
					episodeFileCount: 12,
					id: 42,
					posterUrl: "/show.jpg",
					status: "continuing",
					title: "Andor",
					year: 2022,
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("Andor poster"))
			.toHaveAttribute("src", "/show.jpg");
		await expect
			.element(page.getByAltText("Andor poster"))
			.toHaveAttribute("data-type", "show");
		await expect.element(page.getByText("12/24")).toBeInTheDocument();
		await expect.element(page.getByText("2022")).toBeInTheDocument();
		await expect
			.element(page.getByText("Continuing"))
			.toHaveClass("bg-green-600");
		expect(container.querySelector('a[href="/tv/series/42"]')).not.toBeNull();
	});

	it("falls back to default badge styling and omits the year when unknown", async () => {
		await renderWithProviders(
			<ShowCard
				show={{
					episodeCount: 8,
					episodeFileCount: 8,
					id: 5,
					posterUrl: "",
					status: "paused",
					title: "Silo",
					year: 0,
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("Silo poster"))
			.not.toHaveAttribute("src");
		await expect.element(page.getByText("Paused")).toHaveClass("bg-zinc-600");
		await expect.element(page.getByText("0")).not.toBeInTheDocument();
	});
});
