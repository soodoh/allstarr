import type { ReactNode } from "react";
import { trapBrowserConsoleError } from "src/test/browser-console";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const seasonAccordionMocks = vi.hoisted(() => ({
	bulkMonitor: {
		mutate: vi.fn(),
	},
	bulkUnmonitor: {
		isPending: false,
		mutate: vi.fn(),
	},
	router: {
		invalidate: vi.fn(),
	},
}));

let browserConsoleGuard: ReturnType<typeof trapBrowserConsoleError> | undefined;

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => seasonAccordionMocks.router,
}));

vi.mock("src/components/shared/profile-toggle-icons", () => ({
	default: ({
		activeProfileIds,
		onToggle,
		partialProfileIds,
		profiles,
	}: {
		activeProfileIds: number[];
		onToggle: (profileId: number) => void;
		partialProfileIds: number[];
		profiles: Array<{ id: number; name: string }>;
	}) => (
		<div>
			{profiles.map((profile) => {
				const state = activeProfileIds.includes(profile.id)
					? "active"
					: partialProfileIds.includes(profile.id)
						? "partial"
						: "inactive";

				return (
					<button
						key={profile.id}
						onClick={() => onToggle(profile.id)}
						type="button"
					>
						{profile.name}:{state}
					</button>
				);
			})}
		</div>
	),
}));

vi.mock("src/components/shared/unmonitor-dialog", () => ({
	default: ({
		fileCount,
		isPending,
		itemTitle,
		itemType,
		open,
		onConfirm,
		onOpenChange,
		profileName,
	}: {
		fileCount: number;
		isPending: boolean;
		itemTitle: string;
		itemType: string;
		open: boolean;
		onConfirm: (deleteFiles: boolean) => void;
		onOpenChange: (open: boolean) => void;
		profileName: string;
	}) =>
		open ? (
			<div data-testid="unmonitor-dialog">
				<div>
					unmonitor:{profileName}:{itemTitle}:{itemType}:{String(isPending)}:
					{fileCount}
				</div>
				<button onClick={() => onConfirm(true)} type="button">
					Confirm delete
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Close dialog
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/ui/accordion", async () => {
	const { createContext, useContext, useState } = await import("react");

	const AccordionItemContext = createContext<{
		open: boolean;
		setOpen: (open: boolean) => void;
	} | null>(null);

	return {
		AccordionContent: ({ children }: { children: ReactNode }) => {
			const accordionItem = useContext(AccordionItemContext);

			if (!accordionItem?.open) {
				return null;
			}

			return <div data-testid="accordion-content">{children}</div>;
		},
		AccordionItem: ({
			children,
			value,
		}: {
			children: ReactNode;
			value: string;
		}) => {
			const [open, setOpen] = useState(false);

			return (
				<AccordionItemContext.Provider value={{ open, setOpen }}>
					<section data-state={open ? "open" : "closed"} data-value={value}>
						{children}
					</section>
				</AccordionItemContext.Provider>
			);
		},
		AccordionTrigger: ({
			children,
			className,
		}: {
			children: ReactNode;
			className?: string;
		}) => {
			const accordionItem = useContext(AccordionItemContext);

			return (
				<button
					className={className}
					data-state={accordionItem?.open ? "open" : "closed"}
					onClick={() => {
						if (accordionItem) {
							accordionItem.setOpen(!accordionItem.open);
						}
					}}
					type="button"
				>
					{children}
				</button>
			);
		},
	};
});

vi.mock("./episode-row", () => ({
	default: ({
		episode,
		seriesType,
	}: {
		episode: {
			id: number;
			episodeNumber: number;
			title: string;
		};
		seriesType: string;
	}) => (
		<div data-testid="episode-row">
			episode:{episode.id}:{episode.episodeNumber}:{episode.title}:{seriesType}
		</div>
	),
}));

vi.mock("src/hooks/mutations/episode-profiles", () => ({
	useBulkMonitorEpisodeProfile: () => seasonAccordionMocks.bulkMonitor,
	useBulkUnmonitorEpisodeProfile: () => seasonAccordionMocks.bulkUnmonitor,
}));

import SeasonAccordion from "./season-accordion";

describe("SeasonAccordion", () => {
	beforeEach(() => {
		browserConsoleGuard = trapBrowserConsoleError();
		seasonAccordionMocks.bulkMonitor.mutate.mockReset();
		seasonAccordionMocks.bulkUnmonitor.isPending = false;
		seasonAccordionMocks.bulkUnmonitor.mutate.mockReset();
		seasonAccordionMocks.router.invalidate.mockReset();
	});

	afterEach(() => {
		if (!browserConsoleGuard) {
			return;
		}

		try {
			browserConsoleGuard.assertNoDomNestingWarnings();
		} finally {
			browserConsoleGuard.restore();
		}
	});

	it("renders an empty season with muted progress and no profile icons", async () => {
		const { container } = await renderWithProviders(
			<SeasonAccordion
				downloadProfiles={[]}
				season={{
					id: 77,
					episodes: [],
					overview: null,
					posterUrl: null,
					seasonNumber: 0,
				}}
				seriesType="standard"
			/>,
		);

		await expect
			.element(page.getByText("Specials", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("0 episodes", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("0/0", { exact: true }))
			.toBeInTheDocument();
		expect(container.querySelector(".text-muted-foreground")).not.toBeNull();
		await expect
			.element(page.getByRole("button", { name: /profile/i }))
			.not.toBeInTheDocument();
	});

	it("sorts episodes and toggles active and inactive profiles", async () => {
		await renderWithProviders(
			<SeasonAccordion
				downloadProfiles={[
					{ icon: "tv", id: 11, name: "4K" },
					{ icon: "tv", id: 12, name: "HD" },
					{ icon: "audioLines", id: 13, name: "Audio" },
				]}
				season={{
					id: 88,
					episodes: [
						{
							absoluteNumber: null,
							airDate: "2024-01-15",
							downloadProfileIds: [11, 12],
							episodeNumber: 1,
							hasFile: true,
							id: 202,
							runtime: 44,
							title: "One",
						},
						{
							absoluteNumber: null,
							airDate: "2024-01-22",
							downloadProfileIds: [11],
							episodeNumber: 3,
							hasFile: true,
							id: 201,
							runtime: 44,
							title: "Three",
						},
						{
							absoluteNumber: null,
							airDate: "2024-01-18",
							downloadProfileIds: [11, 12],
							episodeNumber: 2,
							hasFile: true,
							id: 203,
							runtime: 44,
							title: "Two",
						},
					],
					overview: "Season overview",
					posterUrl: "/season.jpg",
					seasonNumber: 2,
				}}
				seriesType="anime"
			/>,
		);

		await expect
			.element(page.getByText("Season 2", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("3 episodes", { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("3/3", { exact: true }))
			.toHaveClass("text-green-500");
		await expect.element(page.getByText("4K:active")).toBeInTheDocument();
		await expect.element(page.getByText("HD:partial")).toBeInTheDocument();
		await expect.element(page.getByText("Audio:inactive")).toBeInTheDocument();
		await expect
			.element(page.getByText("episode:201:3:Three:anime"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("episode:203:2:Two:anime"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("episode:202:1:One:anime"))
			.not.toBeInTheDocument();

		await page
			.getByRole("button", { name: /Season 2, 3 episodes, 3\/3 files/ })
			.click();

		await expect
			.element(page.getByText("episode:201:3:Three:anime"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("episode:203:2:Two:anime"))
			.toBeInTheDocument();
		await expect
			.element(page.getByText("episode:202:1:One:anime"))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByRole("button", { name: /Season 2, 3 episodes, 3\/3 files/ }),
			)
			.toHaveAttribute("data-state", "open");

		await page.getByRole("button", { name: "HD:partial", exact: true }).click();
		expect(seasonAccordionMocks.bulkMonitor.mutate).toHaveBeenCalledWith(
			{
				downloadProfileId: 12,
				episodeIds: [201, 203, 202],
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);
		const monitorOnSuccess = seasonAccordionMocks.bulkMonitor.mutate.mock
			.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		monitorOnSuccess?.();
		expect(seasonAccordionMocks.router.invalidate).toHaveBeenCalledTimes(1);
		await expect
			.element(page.getByText("episode:201:3:Three:anime"))
			.toBeInTheDocument();
		await expect
			.element(
				page.getByRole("button", { name: /Season 2, 3 episodes, 3\/3 files/ }),
			)
			.toHaveAttribute("data-state", "open");

		await page
			.getByRole("button", { name: /Season 2, 3 episodes, 3\/3 files/ })
			.click();

		await expect
			.element(page.getByText("episode:201:3:Three:anime"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("episode:203:2:Two:anime"))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText("episode:202:1:One:anime"))
			.not.toBeInTheDocument();
		await expect
			.element(
				page.getByRole("button", { name: /Season 2, 3 episodes, 3\/3 files/ }),
			)
			.toHaveAttribute("data-state", "closed");

		await page.getByRole("button", { name: "4K:active", exact: true }).click();
		await expect
			.element(page.getByText("unmonitor:4K:Season 2:season:false:0"))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Confirm delete" }).click();
		expect(seasonAccordionMocks.bulkUnmonitor.mutate).toHaveBeenCalledWith(
			{
				deleteFiles: true,
				downloadProfileId: 11,
				episodeIds: [201, 203, 202],
			},
			expect.objectContaining({
				onSuccess: expect.any(Function),
			}),
		);

		const unmonitorOnSuccess = seasonAccordionMocks.bulkUnmonitor.mutate.mock
			.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
		unmonitorOnSuccess?.();

		expect(seasonAccordionMocks.router.invalidate).toHaveBeenCalledTimes(2);
		await expect
			.element(page.getByTestId("unmonitor-dialog"))
			.not.toBeInTheDocument();
	});
});
