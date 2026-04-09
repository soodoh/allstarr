import { fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cfScoreSectionMocks = vi.hoisted(() => ({
	addCategory: {
		mutate: vi.fn(),
	},
	profileQueryRefetch: vi.fn(),
	removeCFs: {
		mutate: vi.fn(),
	},
	setScore: {
		mutate: vi.fn(),
	},
	useQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			cfScoreSectionMocks.useQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			cfScoreSectionMocks.useSuspenseQuery(...args),
	};
});

vi.mock("src/components/settings/custom-formats/preset-selector", () => ({
	default: ({
		onApplied,
	}: {
		onApplied?: (result: {
			minCustomFormatScore: number;
			upgradeUntilCustomFormatScore: number;
		}) => void;
	}) => (
		<button
			onClick={() =>
				onApplied?.({
					minCustomFormatScore: 222,
					upgradeUntilCustomFormatScore: 333,
				})
			}
			type="button"
		>
			Apply Preset
		</button>
	),
}));

vi.mock("src/hooks/mutations/custom-formats", () => ({
	useAddCategoryToProfile: () => cfScoreSectionMocks.addCategory,
	useRemoveProfileCFs: () => cfScoreSectionMocks.removeCFs,
	useSetProfileCFScore: () => cfScoreSectionMocks.setScore,
}));

vi.mock("src/lib/queries/custom-formats", () => ({
	customFormatsListQuery: () => ({
		queryFn: vi.fn(),
		queryKey: ["customFormats", "list"],
	}),
	profileCustomFormatsQuery: (profileId: number) => ({
		queryFn: vi.fn(),
		queryKey: ["customFormats", "profileScores", profileId],
	}),
}));

import CFScoreSection from "./cf-score-section";

const allCustomFormats = [
	{
		category: "Release Group",
		contentTypes: ["movie"],
		defaultScore: 100,
		id: 1,
		name: "Movie Title Match",
	},
	{
		category: "Source",
		contentTypes: ["movie"],
		defaultScore: 50,
		id: 2,
		name: "Movie Source Boost",
	},
	{
		category: "Resolution",
		contentTypes: ["movie"],
		defaultScore: 75,
		id: 3,
		name: "Movie Resolution",
	},
	{
		category: "Source",
		contentTypes: ["tv"],
		defaultScore: 25,
		id: 4,
		name: "TV Source",
	},
];

function createMutationMock() {
	return {
		mutate: vi.fn((_input: unknown, options?: { onSuccess?: () => void }) => {
			options?.onSuccess?.();
		}),
	};
}

describe("CFScoreSection", () => {
	beforeEach(() => {
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: vi.fn(),
			writable: true,
		});
		cfScoreSectionMocks.addCategory = createMutationMock();
		cfScoreSectionMocks.removeCFs = createMutationMock();
		cfScoreSectionMocks.setScore = createMutationMock();
		cfScoreSectionMocks.profileQueryRefetch.mockReset();
		cfScoreSectionMocks.useQuery.mockReset();
		cfScoreSectionMocks.useSuspenseQuery.mockReset();
	});

	afterEach(() => {
		cfScoreSectionMocks.profileQueryRefetch.mockReset();
		cfScoreSectionMocks.useQuery.mockReset();
		cfScoreSectionMocks.useSuspenseQuery.mockReset();
	});

	it("supports local score editing, format adds, and category adds for a new profile", async () => {
		const user = userEvent.setup();
		const onMinScoreChange = vi.fn();
		const onUpgradeUntilScoreChange = vi.fn();
		const onLocalScoresChange = vi.fn();

		cfScoreSectionMocks.useSuspenseQuery.mockReturnValue({
			data: allCustomFormats,
		});
		cfScoreSectionMocks.useQuery.mockImplementation(
			({ enabled }: { enabled?: boolean }) => ({
				data: enabled ? undefined : undefined,
				refetch: cfScoreSectionMocks.profileQueryRefetch,
			}),
		);

		const { getByLabelText, getByPlaceholderText, getByRole, getByText } =
			renderWithProviders(
				<CFScoreSection
					contentType="movie"
					localScores={[{ customFormatId: 1, score: 125 }]}
					minCustomFormatScore={100}
					onLocalScoresChange={onLocalScoresChange}
					onMinScoreChange={onMinScoreChange}
					onUpgradeUntilScoreChange={onUpgradeUntilScoreChange}
					upgradeUntilCustomFormatScore={200}
				/>,
			);

		const row = getByText("Movie Title Match").closest("tr");
		expect(row).not.toBeNull();
		if (!row) {
			throw new Error("Expected a score row");
		}

		const rowScope = within(row);
		const scoreInput = rowScope.getByRole("spinbutton");
		fireEvent.change(scoreInput, { target: { value: "130" } });

		expect(onLocalScoresChange).toHaveBeenCalledWith([
			{ customFormatId: 1, score: 130 },
		]);

		await user.click(
			rowScope.getByRole("button", { name: "Reset to default score" }),
		);
		expect(onLocalScoresChange).toHaveBeenLastCalledWith([
			{ customFormatId: 1, score: 100 },
		]);

		await user.click(rowScope.getByRole("button", { name: "Remove" }));
		expect(onLocalScoresChange).toHaveBeenLastCalledWith([]);

		fireEvent.change(getByLabelText("Minimum Custom Format Score"), {
			target: { value: "250" },
		});
		fireEvent.change(getByLabelText("Upgrade Until Score"), {
			target: { value: "500" },
		});

		expect(onMinScoreChange).toHaveBeenCalledWith(250);
		expect(onUpgradeUntilScoreChange).toHaveBeenCalledWith(500);

		const addFormatInput = getByPlaceholderText("Add a custom format...");
		await user.type(addFormatInput, "Source");
		const sourceBoostOption = getByText("Movie Source Boost").closest("button");
		expect(sourceBoostOption).not.toBeNull();
		if (!sourceBoostOption) {
			throw new Error("Expected source boost option to render");
		}
		await user.click(sourceBoostOption);

		expect(onLocalScoresChange).toHaveBeenLastCalledWith([
			{ customFormatId: 1, score: 125 },
			{ customFormatId: 2, score: 50 },
		]);

		await user.click(getByRole("button", { name: "Add Category" }));
		await user.click(getByRole("button", { name: "Resolution" }));

		expect(onLocalScoresChange).toHaveBeenLastCalledWith([
			{ customFormatId: 1, score: 125 },
			{ customFormatId: 3, score: 75 },
		]);
	});

	it("mutates server-backed profiles and applies preset thresholds", async () => {
		const user = userEvent.setup();
		const onMinScoreChange = vi.fn();
		const onUpgradeUntilScoreChange = vi.fn();

		cfScoreSectionMocks.useSuspenseQuery.mockReturnValue({
			data: allCustomFormats,
		});
		cfScoreSectionMocks.useQuery.mockImplementation(
			({ enabled }: { enabled?: boolean }) => ({
				data: enabled
					? [
							{
								category: "Release Group",
								customFormatId: 1,
								defaultScore: 100,
								name: "Movie Title Match",
								score: 125,
							},
						]
					: undefined,
				refetch: cfScoreSectionMocks.profileQueryRefetch,
			}),
		);

		const { getByRole, getByText } = renderWithProviders(
			<CFScoreSection
				contentType="movie"
				minCustomFormatScore={100}
				onMinScoreChange={onMinScoreChange}
				onUpgradeUntilScoreChange={onUpgradeUntilScoreChange}
				profileId={42}
				upgradeUntilCustomFormatScore={200}
			/>,
		);

		await user.click(getByRole("button", { name: "Add Category" }));
		await user.click(getByRole("button", { name: "Resolution" }));

		expect(cfScoreSectionMocks.addCategory.mutate).toHaveBeenCalledWith(
			{ profileId: 42, category: "Resolution" },
			expect.objectContaining({ onSuccess: expect.any(Function) }),
		);
		expect(cfScoreSectionMocks.profileQueryRefetch).toHaveBeenCalled();

		const row = getByText("Movie Title Match").closest("tr");
		expect(row).not.toBeNull();
		if (!row) {
			throw new Error("Expected a score row");
		}
		const rowScope = within(row);
		const rowScoreInput = rowScope.getByRole("spinbutton");
		fireEvent.change(rowScoreInput, { target: { value: "140" } });

		expect(cfScoreSectionMocks.setScore.mutate).toHaveBeenCalledWith(
			{ profileId: 42, customFormatId: 1, score: 140 },
			expect.objectContaining({ onSuccess: expect.any(Function) }),
		);

		await user.click(getByRole("button", { name: "Remove All" }));

		expect(cfScoreSectionMocks.removeCFs.mutate).toHaveBeenCalledWith(
			{ profileId: 42, customFormatIds: [1] },
			expect.objectContaining({ onSuccess: expect.any(Function) }),
		);

		await user.click(getByRole("button", { name: "Apply Preset" }));

		expect(onMinScoreChange).toHaveBeenCalledWith(222);
		expect(onUpgradeUntilScoreChange).toHaveBeenCalledWith(333);
		expect(cfScoreSectionMocks.profileQueryRefetch).toHaveBeenCalled();
	});
});
