import { fireEvent } from "@testing-library/react";
import type { MouseEventHandler, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showTableMocks = vi.hoisted(() => ({
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
			href={to.replace("$showId", params?.showId ?? "")}
			onClick={(event) => {
				event.preventDefault();
				onClick?.(event as unknown as MouseEvent);
			}}
		>
			{children}
		</a>
	),
	useNavigate: () => showTableMocks.navigate,
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
		showTableMocks.useTableColumns(...args),
}));

vi.mock("src/lib/utils", () => ({
	resizeTmdbUrl: (url: string, size: string) => `resized:${url}:${size}`,
}));

import ShowTable from "./show-table";

const shows = [
	{
		downloadProfileIds: [11],
		episodeCount: 24,
		episodeFileCount: 22,
		id: 1,
		network: "Apple TV+",
		posterUrl: "/severance.jpg",
		seasonCount: 2,
		sortTitle: "severance",
		status: "continuing",
		title: "Severance",
		year: 2022,
	},
	{
		downloadProfileIds: [],
		episodeCount: 12,
		episodeFileCount: 12,
		id: 2,
		network: "",
		posterUrl: "/andor.jpg",
		seasonCount: 1,
		sortTitle: "andor",
		status: "paused",
		title: "Andor",
		year: 2024,
	},
];

const visibleColumns = [
	{ key: "cover", label: "Cover" },
	{ key: "title", label: "Title" },
	{ key: "year", label: "Year" },
	{ key: "network", label: "Network" },
	{ key: "seasons", label: "Seasons" },
	{ key: "episodes", label: "Episodes" },
	{ key: "status", label: "Status" },
	{ key: "custom", label: "Custom Label" },
	{ key: "monitored", label: "Profiles" },
];

describe("ShowTable", () => {
	beforeEach(() => {
		showTableMocks.navigate.mockReset();
		showTableMocks.useTableColumns.mockReturnValue({ visibleColumns });
	});

	it("renders sortable rows, fallback values, and navigates on row clicks", () => {
		const onToggleProfile = vi.fn();
		const { container, getByRole, getByText } = renderWithProviders(
			<ShowTable
				downloadProfiles={[
					{ icon: "tv", id: 11, name: "4K" },
					{ icon: "tv", id: 12, name: "HD" },
				]}
				onToggleProfile={onToggleProfile}
				shows={shows}
			/>,
		);

		const rows = Array.from(container.querySelectorAll("tbody tr"));
		expect(rows[0]).toHaveTextContent("Andor");
		expect(rows[1]).toHaveTextContent("Severance");
		expect(getByText("Continuing")).toHaveClass("bg-green-600");
		expect(getByText("paused")).toHaveClass("bg-zinc-600");
		expect(getByText("12/12")).toBeInTheDocument();
		expect(getByText("22/24")).toBeInTheDocument();
		expect(getByText("—")).toBeInTheDocument();
		expect(container.querySelector('img[alt="Severance"]')).toHaveAttribute(
			"src",
			"resized:/severance.jpg:w185",
		);
		expect(container.querySelector('a[href="/tv/series/1"]')).not.toBeNull();

		fireEvent.click(getByText("4K"));
		expect(onToggleProfile).toHaveBeenCalledWith(1, 11);

		fireEvent.click(getByRole("link", { name: "Severance" }));
		expect(showTableMocks.navigate).not.toHaveBeenCalled();

		fireEvent.click(rows[1] as HTMLTableRowElement);
		expect(showTableMocks.navigate).toHaveBeenCalledWith({
			params: { showId: "1" },
			to: "/tv/series/$showId",
		});

		fireEvent.click(getByText("Year"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Severance",
		);
		fireEvent.click(getByText("Year"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		expect(getByText("Custom Label")).toBeInTheDocument();
		fireEvent.click(getByText("Network"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		fireEvent.click(getByText("Seasons"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		fireEvent.click(getByText("Seasons"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Severance",
		);
		fireEvent.click(getByText("Episodes"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		fireEvent.click(getByText("Status"));
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Severance",
		);
	});

	it("supports selection mode and header toggles", () => {
		const onToggleAll = vi.fn();
		const onToggleSelect = vi.fn();
		const selectedIds = new Set([1, 2]);
		const { container, getAllByRole } = renderWithProviders(
			<ShowTable
				onToggleAll={onToggleAll}
				onToggleSelect={onToggleSelect}
				selectedIds={selectedIds}
				selectable
				shows={shows}
			/>,
		);

		const checkboxes = getAllByRole("checkbox");
		expect(checkboxes[0]).toBeChecked();
		expect(checkboxes[1]).toBeChecked();

		fireEvent.click(checkboxes[0] as HTMLInputElement);
		expect(onToggleAll).toHaveBeenCalledTimes(1);

		fireEvent.click(checkboxes[1] as HTMLInputElement);
		expect(onToggleSelect).toHaveBeenCalledWith(2);

		fireEvent.click(
			container.querySelectorAll("tbody tr")[1] as HTMLTableRowElement,
		);
		expect(onToggleSelect).toHaveBeenCalledWith(1);
	});
});
