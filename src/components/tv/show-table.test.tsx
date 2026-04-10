import type { MouseEventHandler, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

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
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
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

	it("renders sortable rows, fallback values, and navigates on row clicks", async () => {
		const onToggleProfile = vi.fn();
		const { container } = await renderWithProviders(
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
		await expect
			.element(page.getByText("Continuing"))
			.toHaveClass("bg-green-600");
		await expect.element(page.getByText("paused")).toHaveClass("bg-zinc-600");
		await expect.element(page.getByText("12/12")).toBeInTheDocument();
		await expect.element(page.getByText("22/24")).toBeInTheDocument();
		await expect.element(page.getByText("—")).toBeInTheDocument();
		expect(container.querySelector('img[alt="Severance"]')).toHaveAttribute(
			"src",
			"resized:/severance.jpg:w185",
		);
		expect(container.querySelector('a[href="/tv/series/1"]')).not.toBeNull();

		await page.getByText("4K").click();
		expect(onToggleProfile).toHaveBeenCalledWith(1, 11);

		await page.getByRole("link", { name: "Severance" }).click();
		expect(showTableMocks.navigate).not.toHaveBeenCalled();

		await (rows[1] as HTMLTableRowElement).click();
		expect(showTableMocks.navigate).toHaveBeenCalledWith({
			params: { showId: "1" },
			to: "/tv/series/$showId",
		});

		await page.getByText("Year").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Severance",
		);
		await page.getByText("Year").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		await expect.element(page.getByText("Custom Label")).toBeInTheDocument();
		await page.getByText("Network").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		await page.getByText("Seasons").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		await page.getByText("Seasons").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Severance",
		);
		await page.getByText("Episodes").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Andor",
		);
		await page.getByText("Status").click();
		expect(container.querySelectorAll("tbody tr")[0]).toHaveTextContent(
			"Severance",
		);
	});

	it("supports selection mode and header toggles", async () => {
		const onToggleAll = vi.fn();
		const onToggleSelect = vi.fn();
		const selectedIds = new Set([1, 2]);
		const { container } = await renderWithProviders(
			<ShowTable
				onToggleAll={onToggleAll}
				onToggleSelect={onToggleSelect}
				selectedIds={selectedIds}
				selectable
				shows={shows}
			/>,
		);

		const checkboxes = page.getByRole("checkbox").all();
		await expect.element(checkboxes[0]).toBeChecked();
		await expect.element(checkboxes[1]).toBeChecked();

		await checkboxes[0].click();
		expect(onToggleAll).toHaveBeenCalledTimes(1);

		await checkboxes[1].click();
		expect(onToggleSelect).toHaveBeenCalledWith(2);

		await (
			container.querySelectorAll("tbody tr")[1] as HTMLTableRowElement
		).click();
		expect(onToggleSelect).toHaveBeenCalledWith(1);
	});
});
