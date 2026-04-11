import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const bookCardMocks = vi.hoisted(() => ({
	navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => bookCardMocks.navigate,
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

import BookCard from "./book-card";

describe("BookCard", () => {
	beforeEach(() => {
		bookCardMocks.navigate.mockReset();
	});

	it("sorts authors, truncates overflow names, renders metadata, and navigates on click", async () => {
		await renderWithProviders(
			<BookCard
				book={{
					bookAuthors: [
						{
							authorId: 2,
							authorName: "Zeta Writer",
							foreignAuthorId: "2",
							isPrimary: false,
						},
						{
							authorId: 1,
							authorName: "Primary Writer",
							foreignAuthorId: "1",
							isPrimary: true,
						},
						{
							authorId: 3,
							authorName: "Alpha Writer",
							foreignAuthorId: "3",
							isPrimary: false,
						},
						{
							authorId: 4,
							authorName: "Beta Writer",
							foreignAuthorId: "4",
							isPrimary: false,
						},
					],
					coverUrl: "/cover.jpg",
					id: 42,
					releaseDate: "2024-06-01",
					title: "The Book",
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("The Book cover"))
			.toHaveAttribute("src", "/cover.jpg");
		await expect
			.element(page.getByAltText("The Book cover"))
			.toHaveAttribute("data-type", "book");
		await expect.element(page.getByText("The Book")).toBeInTheDocument();
		await expect
			.element(
				page.getByText("Primary Writer, Alpha Writer, Beta Writer, and 1 more"),
			)
			.toBeInTheDocument();
		await expect.element(page.getByText("2024-06-01")).toBeInTheDocument();

		await page.getByRole("button").click();
		expect(bookCardMocks.navigate).toHaveBeenCalledWith({
			params: { bookId: "42" },
			to: "/books/$bookId",
		});
	});

	it("falls back to unknown author text and omits the release date when absent", async () => {
		await renderWithProviders(
			<BookCard
				book={{
					bookAuthors: [],
					coverUrl: null,
					id: 7,
					releaseDate: null,
					title: "Mystery",
				}}
			/>,
		);

		await expect
			.element(page.getByAltText("Mystery cover"))
			.not.toHaveAttribute("src");
		await expect.element(page.getByText("Unknown author")).toBeInTheDocument();
		await expect.element(page.getByText("2024-06-01")).not.toBeInTheDocument();
	});
});
