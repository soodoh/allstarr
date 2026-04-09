import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		onClick,
		params,
		to,
	}: {
		children: React.ReactNode;
		className?: string;
		onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
		params?: Record<string, string>;
		to: string;
	}) => (
		<a
			className={className}
			href={to.replace("$authorId", params?.authorId ?? "")}
			onClick={onClick}
		>
			{children}
		</a>
	),
}));

vi.mock("src/components/bookshelf/hardcover/author-preview-modal", () => ({
	default: ({
		author,
		onOpenChange,
		open,
	}: {
		author: { title: string };
		onOpenChange: (open: boolean) => void;
		open: boolean;
	}) =>
		open ? (
			<div data-testid="author-preview-modal">
				<span>{author.title}</span>
				<button type="button" onClick={() => onOpenChange(false)}>
					close-preview
				</button>
			</div>
		) : null,
}));

import AdditionalAuthors, { type BookAuthorEntry } from "./additional-authors";

const authors: BookAuthorEntry[] = [
	{
		authorId: 1,
		authorName: "Primary Author",
		foreignAuthorId: "1",
		isPrimary: true,
	},
	{
		authorId: 2,
		authorName: "Alpha Writer",
		foreignAuthorId: "2",
		isPrimary: false,
	},
	{
		authorId: null,
		authorName: "Preview Writer",
		foreignAuthorId: "foreign-3",
		isPrimary: false,
	},
	{
		authorId: 4,
		authorName: "Zeta Author",
		foreignAuthorId: "4",
		isPrimary: false,
	},
];

describe("AdditionalAuthors", () => {
	it("returns null for empty author lists", async () => {
		const { container } = await renderWithProviders(
			<AdditionalAuthors bookAuthors={[]} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("sorts authors, links local authors, and opens a preview for foreign authors", async () => {
		const { container } = await renderWithProviders(
			<AdditionalAuthors bookAuthors={authors.slice(0, 3)} maxVisible={5} />,
		);

		expect(container.textContent).toContain(
			"Primary Author, Alpha Writer, Preview Writer",
		);
		expect(container.querySelector('a[href="/authors/1"]')).not.toBeNull();
		expect(container.querySelector('a[href="/authors/2"]')).not.toBeNull();

		await page.getByText("Preview Writer").click();
		await expect
			.element(page.getByTestId("author-preview-modal"))
			.toHaveTextContent("Preview Writer");

		await page.getByText("close-preview").click();
		await expect
			.element(page.getByTestId("author-preview-modal"))
			.not.toBeInTheDocument();
	});

	it("truncates long author lists and can expand or keep the current author as plain text", async () => {
		const { container } = await renderWithProviders(
			<AdditionalAuthors
				bookAuthors={authors}
				currentAuthorId={1}
				expandable
				maxVisible={2}
			/>,
		);

		await expect
			.element(page.getByRole("link", { name: "Primary Author" }))
			.not.toBeInTheDocument();
		expect(container.textContent).toContain(
			"Primary Author, Alpha Writer, and 2 more",
		);

		await page.getByText(", and 2 more").click();
		expect(container.textContent).toContain(
			"Primary Author, Alpha Writer, Preview Writer, Zeta Author",
		);
		await expect.element(page.getByText("(show less)")).toBeInTheDocument();
	});
});
