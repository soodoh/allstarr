import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const authorTableMocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useTableColumns: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		className,
		onClick,
		params,
		to,
	}: {
		children: ReactNode;
		className?: string;
		onClick?: (event: MouseEvent) => void;
		params?: Record<string, string>;
		to: string;
	}) => (
		<a
			className={className}
			href={to.replace("$authorId", params?.authorId ?? "")}
			onClick={(event) => {
				event.preventDefault();
				onClick?.(event as unknown as MouseEvent);
			}}
		>
			{children}
		</a>
	),
	useNavigate: () => authorTableMocks.navigate,
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

vi.mock("src/components/ui/table", () => ({
	Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
	TableBody: ({ children }: { children: ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <td className={className}>{children}</td>,
	TableHead: ({
		children,
		className,
		onClick,
	}: {
		children: ReactNode;
		className?: string;
		onClick?: () => void;
	}) => (
		<th className={className} onClick={onClick}>
			{children}
		</th>
	),
	TableHeader: ({ children }: { children: ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({
		children,
		className,
		onClick,
	}: {
		children: ReactNode;
		className?: string;
		onClick?: () => void;
	}) => (
		<tr className={className} onClick={onClick}>
			{children}
		</tr>
	),
}));

vi.mock("src/hooks/use-table-columns", () => ({
	useTableColumns: (...args: unknown[]) =>
		authorTableMocks.useTableColumns(...args),
}));

import AuthorTable from "./author-table";

const authors = [
	{
		bookCount: 5,
		id: 1,
		images: [{ coverType: "poster", url: "/ada.jpg" }],
		name: "Ada Lovelace",
		sortName: "Lovelace, Ada",
		status: "active",
		totalReaders: 1200,
	},
	{
		bookCount: 2,
		id: 2,
		images: [],
		name: "Barbara Liskov",
		sortName: "Liskov, Barbara",
		status: "active",
		totalReaders: 4200,
	},
	{
		bookCount: 2,
		id: 3,
		images: [{ coverType: "poster", url: "/grace.jpg" }],
		name: "Grace Hopper",
		sortName: "Hopper, Grace",
		status: "active",
		totalReaders: 600,
	},
];

const visibleColumns = [
	{ key: "cover", label: "Cover" },
	{ key: "name", label: "Name" },
	{ key: "bookCount", label: "Books" },
	{ key: "totalReaders", label: "Readers" },
	{ key: "custom", label: "Custom Label" },
];

describe("AuthorTable", () => {
	beforeEach(() => {
		authorTableMocks.navigate.mockReset();
		authorTableMocks.useTableColumns.mockReturnValue({ visibleColumns });
	});

	it("sorts rows, renders links and covers, and navigates from row clicks", async () => {
		const { container } = await renderWithProviders(
			<AuthorTable authors={authors} />,
		);

		const rows = Array.from(container.querySelectorAll("tbody tr"));
		expect(rows[0]).toHaveTextContent("Barbara Liskov");
		expect(rows[1]).toHaveTextContent("Ada Lovelace");
		expect(rows[2]).toHaveTextContent("Grace Hopper");
		expect(container.querySelector('img[alt="Ada Lovelace"]')).toHaveAttribute(
			"src",
			"/ada.jpg",
		);
		expect(
			container.querySelector('img[alt="Barbara Liskov"]'),
		).not.toHaveAttribute("src");
		expect(container.querySelector('a[href="/authors/1"]')).not.toBeNull();
		await expect.element(page.getByText("Custom Label")).toBeInTheDocument();

		await page.getByRole("link", { name: "Ada Lovelace" }).click();
		expect(authorTableMocks.navigate).not.toHaveBeenCalled();

		await (rows[1] as HTMLTableRowElement).click();
		expect(authorTableMocks.navigate).toHaveBeenCalledWith({
			params: { authorId: "1" },
			to: "/authors/$authorId",
		});

		await page.getByText("Books").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Barbara Liskov",
		);
		expect(container.querySelectorAll("tbody tr")[1]).toHaveTextContent(
			"Grace Hopper",
		);
		expect(container.querySelectorAll("tbody tr")[2]).toHaveTextContent(
			"Ada Lovelace",
		);

		await page.getByText("Books").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Ada Lovelace",
		);
		expect(container.querySelectorAll("tbody tr")[1]).toHaveTextContent(
			"Grace Hopper",
		);
		expect(container.querySelectorAll("tbody tr")[2]).toHaveTextContent(
			"Barbara Liskov",
		);
	});
});
