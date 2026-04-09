import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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
			href={to.replace("$authorId", params?.authorId ?? "")}
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

import AuthorCard from "./author-card";

describe("AuthorCard", () => {
	it("prefers the poster image and renders the singular book label", () => {
		const { container, getByAltText, getByText } = renderWithProviders(
			<AuthorCard
				author={{
					bookCount: 1,
					id: 14,
					images: [
						{ coverType: "fanart", url: "/fanart.jpg" },
						{ coverType: "poster", url: "/poster.jpg" },
					],
					name: "Octavia Butler",
				}}
			/>,
		);

		expect(getByAltText("Octavia Butler photo")).toHaveAttribute(
			"src",
			"/poster.jpg",
		);
		expect(getByAltText("Octavia Butler photo")).toHaveAttribute(
			"data-type",
			"author",
		);
		expect(getByText("Octavia Butler")).toBeInTheDocument();
		expect(getByText("1 book")).toBeInTheDocument();
		expect(container.querySelector('a[href="/authors/14"]')).not.toBeNull();
	});

	it("falls back to the first image and pluralizes the book count", () => {
		const { getByAltText, getByText } = renderWithProviders(
			<AuthorCard
				author={{
					bookCount: 5,
					id: 8,
					images: [{ coverType: "banner", url: "/banner.jpg" }],
					name: "N. K. Jemisin",
				}}
			/>,
		);

		expect(getByAltText("N. K. Jemisin photo")).toHaveAttribute(
			"src",
			"/banner.jpg",
		);
		expect(getByText("5 books")).toBeInTheDocument();
	});

	it("renders without an image src when no author images are available", () => {
		const { getByAltText } = renderWithProviders(
			<AuthorCard
				author={{
					bookCount: 0,
					id: 2,
					images: [],
					name: "Unknown",
				}}
			/>,
		);

		expect(getByAltText("Unknown photo")).not.toHaveAttribute("src");
	});
});
