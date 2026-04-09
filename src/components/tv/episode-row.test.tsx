import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const episodeRowMocks = vi.hoisted(() => ({
	monitorEpisodeProfile: {
		mutate: vi.fn(),
	},
	router: {
		invalidate: vi.fn(),
	},
	unmonitorEpisodeProfile: {
		isPending: false,
		mutate: vi.fn(),
	},
}));

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => episodeRowMocks.router,
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
					onClick={() => onToggle(profile.id)}
					type="button"
				>
					{profile.name}
				</button>
			))}
		</div>
	),
}));

vi.mock("src/components/shared/unmonitor-dialog", () => ({
	default: ({
		fileCount,
		isPending,
		itemTitle,
		open,
		onConfirm,
		onOpenChange,
		profileName,
	}: {
		fileCount: number;
		isPending: boolean;
		itemTitle: string;
		open: boolean;
		onConfirm: (deleteFiles: boolean) => void;
		onOpenChange: (open: boolean) => void;
		profileName: string;
	}) => (
		<div>
			<button onClick={() => onConfirm(false)} type="button">
				Force confirm
			</button>
			{open ? (
				<div>
					<div>
						dialog:{profileName}:{itemTitle}:{String(isPending)}:{fileCount}
					</div>
					<button onClick={() => onConfirm(true)} type="button">
						Confirm delete
					</button>
					<button onClick={() => onOpenChange(false)} type="button">
						Close dialog
					</button>
				</div>
			) : null}
		</div>
	),
}));

vi.mock("src/hooks/mutations/episode-profiles", () => ({
	useMonitorEpisodeProfile: () => episodeRowMocks.monitorEpisodeProfile,
	useUnmonitorEpisodeProfile: () => episodeRowMocks.unmonitorEpisodeProfile,
}));

import EpisodeRow from "./episode-row";

describe("EpisodeRow", () => {
	beforeEach(() => {
		episodeRowMocks.monitorEpisodeProfile.mutate.mockReset();
		episodeRowMocks.router.invalidate.mockReset();
		episodeRowMocks.unmonitorEpisodeProfile.isPending = false;
		episodeRowMocks.unmonitorEpisodeProfile.mutate.mockReset();
	});

	it("renders fallback text for unaired anime episodes", () => {
		const { container, getAllByText, getByText, queryByRole } =
			renderWithProviders(
				<EpisodeRow
					downloadProfiles={[]}
					episode={{
						absoluteNumber: 12,
						airDate: null,
						downloadProfileIds: [],
						episodeNumber: 3,
						hasFile: false,
						id: 99,
						runtime: null,
						title: "",
					}}
					seriesType="anime"
				/>,
			);

		expect(getByText("E03 (12)")).toBeInTheDocument();
		expect(getAllByText("TBA")).toHaveLength(2);
		expect(getByText("-")).toBeInTheDocument();
		expect(container.querySelector(".opacity-60")).not.toBeNull();
		expect(queryByRole("button", { name: "4K" })).toBeNull();
	});

	it("monitors inactive profiles and confirms unmonitoring active ones", async () => {
		const user = userEvent.setup();
		const episode = {
			absoluteNumber: null,
			airDate: "2024-01-10",
			downloadProfileIds: [11],
			episodeNumber: 5,
			hasFile: true,
			id: 7,
			runtime: 42,
			title: "The We We Are",
		};

		const { getByText, queryByText } = renderWithProviders(
			<EpisodeRow
				downloadProfiles={[
					{ icon: "tv", id: 11, name: "4K" },
					{ icon: "tv", id: 12, name: "HD" },
				]}
				episode={episode}
				seriesType="standard"
			/>,
		);

		expect(getByText("42m")).toBeInTheDocument();
		await user.click(getByText("Force confirm"));
		expect(
			episodeRowMocks.unmonitorEpisodeProfile.mutate,
		).not.toHaveBeenCalled();

		await user.click(getByText("HD"));
		expect(episodeRowMocks.monitorEpisodeProfile.mutate).toHaveBeenCalledWith(
			{ downloadProfileId: 12, episodeId: 7 },
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const monitorOnSuccess = episodeRowMocks.monitorEpisodeProfile.mutate.mock
			.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		monitorOnSuccess?.();
		expect(episodeRowMocks.router.invalidate).toHaveBeenCalledTimes(1);

		episodeRowMocks.unmonitorEpisodeProfile.isPending = true;
		await user.click(getByText("4K"));
		expect(getByText("dialog:4K:The We We Are:true:0")).toBeInTheDocument();

		await user.click(getByText("Close dialog"));
		expect(
			queryByText("dialog:4K:The We We Are:true:0"),
		).not.toBeInTheDocument();

		await user.click(getByText("4K"));
		await user.click(getByText("Confirm delete"));

		expect(episodeRowMocks.unmonitorEpisodeProfile.mutate).toHaveBeenCalledWith(
			{
				deleteFiles: true,
				downloadProfileId: 11,
				episodeId: 7,
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const unmonitorOnSuccess = episodeRowMocks.unmonitorEpisodeProfile.mutate
			.mock.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		unmonitorOnSuccess?.();
		expect(episodeRowMocks.router.invalidate).toHaveBeenCalledTimes(2);
	});
});
