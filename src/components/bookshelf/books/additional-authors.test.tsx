import { fireEvent } from "@testing-library/react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

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
	it("returns null for empty author lists", () => {
		const { container } = renderWithProviders(
			<AdditionalAuthors bookAuthors={[]} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("sorts authors, links local authors, and opens a preview for foreign authors", () => {
		const { container, getByText, getByTestId } = renderWithProviders(
			<AdditionalAuthors bookAuthors={authors.slice(0, 3)} maxVisible={5} />,
		);

		expect(container.textContent).toContain(
			"Primary Author, Alpha Writer, Preview Writer",
		);
		expect(container.querySelector('a[href="/authors/1"]')).not.toBeNull();
		expect(container.querySelector('a[href="/authors/2"]')).not.toBeNull();

		fireEvent.click(getByText("Preview Writer"));
		expect(getByTestId("author-preview-modal")).toHaveTextContent(
			"Preview Writer",
		);

		fireEvent.click(getByText("close-preview"));
		expect(
			container.querySelector('[data-testid="author-preview-modal"]'),
		).toBeNull();
	});

	it("truncates long author lists and can expand or keep the current author as plain text", () => {
		const { container, getByText, queryByRole } = renderWithProviders(
			<AdditionalAuthors
				bookAuthors={authors}
				currentAuthorId={1}
				expandable
				maxVisible={2}
			/>,
		);

		expect(queryByRole("link", { name: "Primary Author" })).toBeNull();
		expect(container.textContent).toContain(
			"Primary Author, Alpha Writer, and 2 more",
		);

		fireEvent.click(getByText(", and 2 more"));
		expect(container.textContent).toContain(
			"Primary Author, Alpha Writer, Preview Writer, Zeta Author",
		);
		expect(getByText("(show less)")).toBeInTheDocument();
	});
});
