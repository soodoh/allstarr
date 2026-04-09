import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import {
	AuthorCardsSkeleton,
	AuthorTableRowsSkeleton,
	BookCardsSkeleton,
	BookDetailSkeleton,
	BookTableRowsSkeleton,
	SKELETON_KEYS,
	SystemStatusSkeleton,
	TableSkeleton,
} from "./loading-skeleton";

describe("loading skeleton helpers", () => {
	it("pre-generates a stable set of unique skeleton keys", () => {
		expect(SKELETON_KEYS).toHaveLength(100);
		expect(new Set(SKELETON_KEYS)).toHaveLength(100);
		expect(SKELETON_KEYS[0]).toBe("skel-0");
		expect(SKELETON_KEYS.at(-1)).toBe("skel-99");
	});
});

describe("TableSkeleton", () => {
	it("renders the expected placeholder blocks", async () => {
		const { container } = await renderWithProviders(<TableSkeleton />);

		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			9,
		);
	});
});

describe("SystemStatusSkeleton", () => {
	it("renders the expected cards and placeholders", async () => {
		const { container } = await renderWithProviders(<SystemStatusSkeleton />);

		expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			38,
		);
	});
});

describe("AuthorTableRowsSkeleton", () => {
	it("renders the default number of placeholder rows", async () => {
		const { container } = await renderWithProviders(
			<table>
				<tbody>
					<AuthorTableRowsSkeleton />
				</tbody>
			</table>,
		);

		expect(container.querySelectorAll("tr")).toHaveLength(5);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			15,
		);
	});
});

describe("AuthorCardsSkeleton", () => {
	it("renders the requested number of placeholder cards", async () => {
		const { container } = await renderWithProviders(
			<AuthorCardsSkeleton count={3} />,
		);

		expect(container.children).toHaveLength(3);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			9,
		);
	});
});

describe("BookTableRowsSkeleton", () => {
	it("renders leading cells and custom column counts", async () => {
		const { container } = await renderWithProviders(
			<table>
				<tbody>
					<BookTableRowsSkeleton columns={3} hasLeadingCell rows={2} />
				</tbody>
			</table>,
		);

		expect(container.querySelectorAll("tr")).toHaveLength(2);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			8,
		);
		expect(container.querySelector("tr")?.children).toHaveLength(5);
	});
});

describe("BookCardsSkeleton", () => {
	it("renders the requested number of book card placeholders", async () => {
		const { container } = await renderWithProviders(
			<BookCardsSkeleton count={4} />,
		);

		expect(container.children).toHaveLength(4);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			16,
		);
	});
});

describe("BookDetailSkeleton", () => {
	it("renders the detail page placeholder layout", async () => {
		const { container } = await renderWithProviders(<BookDetailSkeleton />);

		expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			30,
		);
	});
});
