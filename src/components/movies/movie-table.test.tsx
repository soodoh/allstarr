import type { MouseEventHandler, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const movieTableMocks = vi.hoisted(() => ({
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
			href={to.replace("$movieId", params?.movieId ?? "")}
			onClick={(event) => {
				event.preventDefault();
				onClick?.(event as unknown as MouseEvent);
			}}
		>
			{children}
		</a>
	),
	useNavigate: () => movieTableMocks.navigate,
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

vi.mock("src/components/shared/profile-toggle-icons", () => ({
	default: ({
		onToggle,
		profiles,
	}: {
		onToggle: (profileId: number) => void;
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div>
			{profiles.map((profile) => (
				<button
					key={profile.id}
					onClick={(event) => {
						event.stopPropagation();
						onToggle(profile.id);
					}}
					type="button"
				>
					{profile.name}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <span className={className}>{children}</span>,
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		onCheckedChange,
		onClick,
	}: {
		checked?: boolean;
		onCheckedChange?: () => void;
		onClick?: MouseEventHandler<HTMLInputElement>;
	}) => (
		<input
			aria-label="Select row"
			checked={Boolean(checked)}
			onChange={() => onCheckedChange?.()}
			onClick={onClick}
			type="checkbox"
		/>
	),
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
		movieTableMocks.useTableColumns(...args),
}));

vi.mock("src/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
	resizeTmdbUrl: (url: string, size: string) => `resized:${url}:${size}`,
}));

import MovieTable from "./movie-table";

const movies = [
	{
		downloadProfileIds: [7],
		hasFile: true,
		id: 1,
		posterUrl: "/alien.jpg",
		sortTitle: "alien",
		status: "released",
		studio: "Fox",
		title: "Alien",
		year: 1982,
	},
	{
		downloadProfileIds: [],
		hasFile: false,
		id: 2,
		posterUrl: "/blade.jpg",
		sortTitle: "blade runner",
		status: "mystery",
		studio: "",
		title: "Blade Runner",
		year: 1979,
	},
];

const visibleColumns = [
	{ key: "cover", label: "Cover" },
	{ key: "title", label: "Title" },
	{ key: "year", label: "Year" },
	{ key: "studio", label: "Studio" },
	{ key: "status", label: "Status" },
	{ key: "custom", label: "Custom Label" },
	{ key: "monitored", label: "Profiles" },
];

describe("MovieTable", () => {
	beforeEach(() => {
		movieTableMocks.navigate.mockReset();
		movieTableMocks.useTableColumns.mockReturnValue({ visibleColumns });
	});

	it("renders sortable rows, fallback content, and navigates on row clicks", async () => {
		const onToggleProfile = vi.fn();
		await renderWithProviders(
			<MovieTable
				downloadProfiles={[
					{ icon: "film", id: 7, name: "4K" },
					{ icon: "film", id: 8, name: "HD" },
				]}
				movies={movies}
				onToggleProfile={onToggleProfile}
			/>,
		);

		const rows = page.getByRole("row");
		await expect.element(rows.nth(1)).toHaveTextContent("Alien");
		await expect.element(rows.nth(2)).toHaveTextContent("Blade Runner");
		await expect
			.element(page.getByText("Released"))
			.toHaveClass("bg-green-600");
		await expect.element(page.getByText("TBA")).toHaveClass("bg-zinc-600");
		await expect.element(page.getByText("—")).toBeInTheDocument();
		await expect
			.element(page.getByRole("img", { name: "Alien" }))
			.toHaveAttribute("src", "resized:/alien.jpg:w185");
		await expect
			.element(page.getByRole("link", { name: "Alien" }))
			.toHaveAttribute("href", "/movies/1");

		await page.getByRole("button", { name: "4K" }).click();
		expect(onToggleProfile).toHaveBeenCalledWith(1, 7);

		await page.getByRole("link", { name: "Alien" }).click();
		expect(movieTableMocks.navigate).not.toHaveBeenCalled();

		await rows.nth(2).click();
		expect(movieTableMocks.navigate).toHaveBeenCalledWith({
			params: { movieId: "2" },
			to: "/movies/$movieId",
		});

		await page.getByText("Year").click();
		await expect
			.element(page.getByRole("row").nth(1))
			.toHaveTextContent("Blade Runner");
		await page.getByText("Year").click();
		await expect
			.element(page.getByRole("row").nth(1))
			.toHaveTextContent("Alien");
		await expect.element(page.getByText("Custom Label")).toBeInTheDocument();
		await page.getByText("Studio").click();
		await expect
			.element(page.getByRole("row").nth(1))
			.toHaveTextContent("Blade Runner");
		await page.getByText("Studio").click();
		await expect
			.element(page.getByRole("row").nth(1))
			.toHaveTextContent("Alien");
		await page.getByText("Status").click();
		await expect
			.element(page.getByRole("row").nth(1))
			.toHaveTextContent("Blade Runner");
	});

	it("supports selection mode and header toggles", async () => {
		const onToggleAll = vi.fn();
		const onToggleSelect = vi.fn();
		const selectedIds = new Set([1, 2]);
		await renderWithProviders(
			<MovieTable
				movies={movies}
				onToggleAll={onToggleAll}
				onToggleSelect={onToggleSelect}
				selectedIds={selectedIds}
				selectable
			/>,
		);

		const checkboxes = page.getByRole("checkbox");
		await expect.element(checkboxes.nth(0)).toBeChecked();
		await expect.element(checkboxes.nth(1)).toBeChecked();

		await checkboxes.nth(0).click();
		expect(onToggleAll).toHaveBeenCalledTimes(1);

		await checkboxes.nth(1).click();
		expect(onToggleSelect).toHaveBeenCalledWith(1);

		await page.getByRole("row").nth(2).click();
		expect(onToggleSelect).toHaveBeenCalledWith(2);
	});
});
