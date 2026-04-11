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
	}) => <img alt={alt} data-type={type} src={src ?? undefined} />,
}));

import AuthorCard from "./author-card";

describe("AuthorCard", () => {
	it("prefers the poster image and renders the singular book label", async () => {
		const { container } = await renderWithProviders(
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

		await expect
			.element(page.getByAltText("Octavia Butler photo"))
			.toHaveAttribute("src", "/poster.jpg");
		await expect
			.element(page.getByAltText("Octavia Butler photo"))
			.toHaveAttribute("data-type", "author");
		await expect.element(page.getByText("Octavia Butler")).toBeInTheDocument();
		await expect.element(page.getByText("1 book")).toBeInTheDocument();
		expect(container.querySelector('a[href="/authors/14"]')).not.toBeNull();
	});

	it("falls back to the first image and pluralizes the book count", async () => {
		await renderWithProviders(
			<AuthorCard
				author={{
					bookCount: 5,
					id: 8,
					images: [{ coverType: "banner", url: "/banner.jpg" }],
					name: "N. K. Jemisin",
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("N. K. Jemisin photo"))
			.toHaveAttribute("src", "/banner.jpg");
		await expect.element(page.getByText("5 books")).toBeInTheDocument();
	});

	it("renders without an image src when no author images are available", async () => {
		await renderWithProviders(
			<AuthorCard
				author={{
					bookCount: 0,
					id: 2,
					images: [],
					name: "Unknown",
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("Unknown photo"))
			.not.toHaveAttribute("src");
	});
});
