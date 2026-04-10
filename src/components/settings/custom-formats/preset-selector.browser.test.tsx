import type { ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const presetSelectorMocks = vi.hoisted(() => ({
	applyPresetFn: vi.fn(),
	getPresetsFn: vi.fn(),
	invalidateQueries: vi.fn(),
	useQuery: vi.fn(),
	useQueryClient: vi.fn(),
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			presetSelectorMocks.useQuery(...args),
		useQueryClient: () => presetSelectorMocks.useQueryClient(),
	};
});

vi.mock("sonner", () => ({
	toast: presetSelectorMocks.toast,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="dialog-root">{children}</div> : null,
	DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/server/custom-format-presets", () => ({
	applyPresetFn: (...args: unknown[]) =>
		presetSelectorMocks.applyPresetFn(...args),
	getPresetsFn: (...args: unknown[]) =>
		presetSelectorMocks.getPresetsFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";
import PresetSelector from "./preset-selector";

const presets = [
	{
		category: "Movie",
		cfCount: 2,
		description: "A compact preset for testing.",
		minCustomFormatScore: 1_500,
		name: "Trash Guides Compact",
		scores: {
			"Movie CAM": -500,
			"Movie HD": 1_000,
		},
		upgradeUntilCustomFormatScore: 3_000,
	},
];

describe("PresetSelector", () => {
	beforeEach(() => {
		presetSelectorMocks.applyPresetFn.mockReset();
		presetSelectorMocks.getPresetsFn.mockReset();
		presetSelectorMocks.invalidateQueries.mockReset();
		presetSelectorMocks.useQuery.mockReset();
		presetSelectorMocks.useQueryClient.mockReset();
		presetSelectorMocks.toast.error.mockReset();
		presetSelectorMocks.toast.success.mockReset();

		presetSelectorMocks.useQueryClient.mockReturnValue({
			invalidateQueries: presetSelectorMocks.invalidateQueries,
		});
		presetSelectorMocks.useQuery.mockImplementation(
			({
				enabled,
				queryFn,
			}: {
				enabled?: boolean;
				queryFn?: () => unknown;
			}) => ({
				data: enabled ? queryFn?.() : undefined,
				isLoading: false,
			}),
		);
	});

	afterEach(() => {
		presetSelectorMocks.applyPresetFn.mockReset();
		presetSelectorMocks.getPresetsFn.mockReset();
	});

	it("loads presets, confirms the selection, and invalidates cached data", async () => {
		const onApplied = vi.fn();
		presetSelectorMocks.applyPresetFn.mockResolvedValue({ success: true });
		presetSelectorMocks.getPresetsFn.mockReturnValue(presets);

		await renderWithProviders(
			<PresetSelector
				contentType="movie"
				onApplied={onApplied}
				profileId={7}
			/>,
		);

		await page.getByRole("button", { name: "Apply Preset" }).click();

		await expect
			.element(
				page.getByRole("heading", { name: "Apply Custom Format Preset" }),
			)
			.toBeInTheDocument();
		expect(presetSelectorMocks.getPresetsFn).toHaveBeenCalledWith({
			data: { contentType: "movie" },
		});
		await expect
			.element(page.getByText("Trash Guides Compact"))
			.toBeInTheDocument();
		await expect.element(page.getByText("Movie HD: +1000")).toBeInTheDocument();
		await expect.element(page.getByText("Movie CAM: -500")).toBeInTheDocument();

		await page
			.getByTestId("dialog-root")
			.getByRole("button", { name: "Apply" })
			.click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(presetSelectorMocks.applyPresetFn).toHaveBeenCalledWith({
			data: { profileId: 7, presetName: "Trash Guides Compact" },
		});
		expect(presetSelectorMocks.toast.success).toHaveBeenCalledWith(
			'Applied preset "Trash Guides Compact"',
		);
		expect(presetSelectorMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.customFormats.all,
		});
		expect(presetSelectorMocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.downloadProfiles.all,
		});
		expect(onApplied).toHaveBeenCalledWith({
			minCustomFormatScore: 1_500,
			upgradeUntilCustomFormatScore: 3_000,
		});
		await expect
			.element(
				page.getByRole("heading", { name: "Apply Custom Format Preset" }),
			)
			.not.toBeInTheDocument();
	});

	it("surfaces apply failures as an error toast", async () => {
		presetSelectorMocks.applyPresetFn.mockRejectedValue(new Error("boom"));
		presetSelectorMocks.getPresetsFn.mockReturnValue(presets);

		await renderWithProviders(
			<PresetSelector contentType="movie" profileId={7} />,
		);

		await page.getByRole("button", { name: "Apply Preset" }).click();
		await expect
			.element(
				page.getByTestId("dialog-root").getByRole("button", { name: "Apply" }),
			)
			.toBeInTheDocument();
		await page
			.getByTestId("dialog-root")
			.getByRole("button", { name: "Apply" })
			.click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(presetSelectorMocks.toast.error).toHaveBeenCalledWith(
			"Failed to apply preset: boom",
		);
		expect(presetSelectorMocks.invalidateQueries).not.toHaveBeenCalled();
	});
});
