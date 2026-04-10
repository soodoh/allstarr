import type { ComponentProps } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("@unpic/react", () => ({
	Image: ({ alt = "", ...props }: ComponentProps<"img">) => (
		<img alt={alt} {...props} />
	),
}));

import OptimizedImage from "./optimized-image";

describe("OptimizedImage", () => {
	it("renders the remote image when a source is available", async () => {
		renderWithProviders(
			<OptimizedImage
				alt="Dune cover"
				height={300}
				src="https://example.com/dune.jpg"
				type="book"
				width={200}
			/>,
		);

		await expect
			.element(page.getByAltText("Dune cover"))
			.toHaveAttribute("src", "https://example.com/dune.jpg");
		await expect.element(page.getByText("No cover")).not.toBeInTheDocument();
	});

	it("uses eager loading hints for priority images", async () => {
		renderWithProviders(
			<OptimizedImage
				alt="Featured poster"
				height={300}
				priority
				src="https://example.com/featured.jpg"
				type="movie"
				width={200}
			/>,
		);

		await expect
			.element(page.getByAltText("Featured poster"))
			.toHaveAttribute("loading", "eager");
		await expect
			.element(page.getByAltText("Featured poster"))
			.toHaveAttribute("fetchpriority", "high");
	});

	it("renders the fallback when no source is provided", async () => {
		renderWithProviders(
			<OptimizedImage
				alt="Missing author"
				height={300}
				src={null}
				type="author"
				width={200}
			/>,
		);

		await expect.element(page.getByText("No photo")).toBeInTheDocument();
		await expect
			.element(page.getByAltText("Missing author"))
			.not.toBeInTheDocument();
	});

	it("switches to the fallback after the image errors", async () => {
		await renderWithProviders(
			<OptimizedImage
				alt="Broken poster"
				height={300}
				src="https://example.com/broken.jpg"
				type="movie"
				width={200}
			/>,
		);

		const img = await page.getByAltText("Broken poster").element();
		img.dispatchEvent(new Event("error"));

		await expect.element(page.getByText("No poster")).toBeInTheDocument();
	});
});
