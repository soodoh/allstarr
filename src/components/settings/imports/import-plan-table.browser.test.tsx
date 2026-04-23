import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const planTableMocks = vi.hoisted(() => ({
	applyImportPlanMutate: vi.fn(),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children, variant }: { children: ReactNode; variant?: string }) => (
		<span data-variant={variant ?? "default"}>{children}</span>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type = "button",
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	CardHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		"aria-label": ariaLabel,
		checked,
		disabled,
		onCheckedChange,
	}: {
		"aria-label"?: string;
		checked?: boolean;
		disabled?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			aria-label={ariaLabel}
			checked={checked}
			disabled={disabled}
			onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/table", () => ({
	Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
	TableBody: ({ children }: { children: ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
	TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
	TableHeader: ({ children }: { children: ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));

vi.mock("src/hooks/mutations/imports", () => ({
	useApplyImportPlan: () => ({
		isPending: false,
		mutate: (payload: Record<string, unknown>) =>
			planTableMocks.applyImportPlanMutate(payload),
	}),
}));

import ImportPlanTable from "./import-plan-table";

const rows = [
	{
		action: "update",
		payload: { targetId: 44, tmdbId: 2022 },
		reason: null,
		resourceType: "show",
		selectable: true,
		sourceKey: "sonarr:7:show:101",
		sourceSummary: "TVDB 999999 -> TMDB 2022",
		target: { id: 44, label: "Severance" },
		title: "Severance",
	},
	{
		action: "unresolved",
		payload: {},
		reason: "Resolve the sync error before planning",
		resourceType: "movie",
		selectable: false,
		sourceKey: "radarr:8:movie:111",
		sourceSummary: "TMDB 11",
		target: { id: null, label: null },
		title: "Dune",
	},
];

describe("ImportPlanTable", () => {
	it("renders mapped plan rows, keeps unresolved rows disabled, and applies selected rows", async () => {
		await renderWithProviders(<ImportPlanTable rows={rows} sourceId={7} />);

		await expect.element(page.getByText("Ready 1")).toBeInTheDocument();
		await expect
			.element(page.getByText("Needs attention 1"))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("cell", { name: "Severance" }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByText("TVDB 999999 -> TMDB 2022"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("Resolve the sync error before planning"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Dune")).toBeInTheDocument();

		await expect
			.element(page.getByRole("checkbox", { name: "Select Dune" }))
			.toBeDisabled();

		await page.getByRole("button", { name: "Apply Selected" }).click();
		expect(planTableMocks.applyImportPlanMutate).toHaveBeenCalledWith({
			selectedRows: [
				{
					action: "update",
					payload: { targetId: 44, tmdbId: 2022 },
					resourceType: "show",
					sourceKey: "sonarr:7:show:101",
				},
			],
			sourceId: 7,
		});
	});
});
