import { fireEvent } from "@testing-library/react";
import type { MouseEventHandler, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

	it("renders sortable rows, fallback content, and navigates on row clicks", () => {
		const onToggleProfile = vi.fn();
		const { container, getByRole, getByText } = renderWithProviders(
			<MovieTable
				downloadProfiles={[
					{ icon: "film", id: 7, name: "4K" },
					{ icon: "film", id: 8, name: "HD" },
				]}
				movies={movies}
				onToggleProfile={onToggleProfile}
			/>,
		);

		const rows = Array.from(container.querySelectorAll("tbody tr"));
		expect(rows[0]).toHaveTextContent("Alien");
		expect(rows[1]).toHaveTextContent("Blade Runner");
		expect(getByText("Released")).toHaveClass("bg-green-600");
		expect(getByText("TBA")).toHaveClass("bg-zinc-600");
		expect(getByText("—")).toBeInTheDocument();
		expect(container.querySelector('img[alt="Alien"]')).toHaveAttribute(
			"src",
			"resized:/alien.jpg:w185",
		);
		expect(container.querySelector('a[href="/movies/1"]')).not.toBeNull();

		fireEvent.click(getByText("4K"));
		expect(onToggleProfile).toHaveBeenCalledWith(1, 7);

		fireEvent.click(getByRole("link", { name: "Alien" }));
		expect(movieTableMocks.navigate).not.toHaveBeenCalled();

		fireEvent.click(rows[1] as HTMLTableRowElement);
		expect(movieTableMocks.navigate).toHaveBeenCalledWith({
			params: { movieId: "2" },
			to: "/movies/$movieId",
		});

		fireEvent.click(getByText("Year"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Blade Runner",
		);
		fireEvent.click(getByText("Year"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Alien",
		);
		expect(getByText("Custom Label")).toBeInTheDocument();
		fireEvent.click(getByText("Studio"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Blade Runner",
		);
		fireEvent.click(getByText("Studio"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Alien",
		);
		fireEvent.click(getByText("Status"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Blade Runner",
		);
	});

	it("supports selection mode and header toggles", () => {
		const onToggleAll = vi.fn();
		const onToggleSelect = vi.fn();
		const selectedIds = new Set([1, 2]);
		const { container, getAllByRole } = renderWithProviders(
			<MovieTable
				movies={movies}
				onToggleAll={onToggleAll}
				onToggleSelect={onToggleSelect}
				selectedIds={selectedIds}
				selectable
			/>,
		);

		const checkboxes = getAllByRole("checkbox");
		expect(checkboxes[0]).toBeChecked();
		expect(checkboxes[1]).toBeChecked();

		fireEvent.click(checkboxes[0] as HTMLInputElement);
		expect(onToggleAll).toHaveBeenCalledTimes(1);

		fireEvent.click(checkboxes[1] as HTMLInputElement);
		expect(onToggleSelect).toHaveBeenCalledWith(1);

		fireEvent.click(
			container.querySelectorAll("tbody tr")[1] as HTMLTableRowElement,
		);
		expect(onToggleSelect).toHaveBeenCalledWith(2);
	});
});
