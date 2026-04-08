import { fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@unpic/react", () => ({
	Image: ({ alt = "", ...props }: ComponentProps<"img">) => (
		<img alt={alt} {...props} />
	),
}));

import OptimizedImage from "./optimized-image";

describe("OptimizedImage", () => {
	it("renders the remote image when a source is available", () => {
		const { getByAltText, queryByText } = renderWithProviders(
			<OptimizedImage
				alt="Dune cover"
				height={300}
				src="https://example.com/dune.jpg"
				type="book"
				width={200}
			/>,
		);

		expect(getByAltText("Dune cover")).toHaveAttribute(
			"src",
			"https://example.com/dune.jpg",
		);
		expect(queryByText("No cover")).not.toBeInTheDocument();
	});

	it("uses eager loading hints for priority images", () => {
		const { getByAltText } = renderWithProviders(
			<OptimizedImage
				alt="Featured poster"
				height={300}
				priority
				src="https://example.com/featured.jpg"
				type="movie"
				width={200}
			/>,
		);

		expect(getByAltText("Featured poster")).toHaveAttribute("loading", "eager");
		expect(getByAltText("Featured poster")).toHaveAttribute(
			"fetchpriority",
			"high",
		);
	});

	it("renders the fallback when no source is provided", () => {
		const { getByText, queryByAltText } = renderWithProviders(
			<OptimizedImage
				alt="Missing author"
				height={300}
				src={null}
				type="author"
				width={200}
			/>,
		);

		expect(getByText("No photo")).toBeInTheDocument();
		expect(queryByAltText("Missing author")).not.toBeInTheDocument();
	});

	it("switches to the fallback after the image errors", () => {
		const { getByAltText, getByText } = renderWithProviders(
			<OptimizedImage
				alt="Broken poster"
				height={300}
				src="https://example.com/broken.jpg"
				type="movie"
				width={200}
			/>,
		);

		fireEvent.error(getByAltText("Broken poster"));

		expect(getByText("No poster")).toBeInTheDocument();
	});
});
