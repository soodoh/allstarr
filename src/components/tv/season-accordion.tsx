import { useRouter } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import EpisodeRow from "src/components/tv/episode-row";
import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "src/components/ui/accordion";
import {
	useBulkMonitorEpisodeProfile,
	useBulkUnmonitorEpisodeProfile,
} from "src/hooks/mutations/episode-profiles";
import { cn } from "src/lib/utils";

type Episode = {
	id: number;
	episodeNumber: number;
	absoluteNumber: number | null;
	title: string;
	airDate: string | null;
	runtime: number | null;
	hasFile: boolean | null;
	downloadProfileIds: number[];
};

type Season = {
	id: number;
	seasonNumber: number;
	overview: string | null;
	posterUrl: string | null;
	episodes: Episode[];
};

type DownloadProfile = {
	id: number;
	name: string;
	icon: string;
};

type SeasonAccordionProps = {
	season: Season;
	seriesType: string;
	downloadProfiles: DownloadProfile[];
};

export default function SeasonAccordion({
	season,
	seriesType,
	downloadProfiles,
}: SeasonAccordionProps): JSX.Element {
	const router = useRouter();
	const bulkMonitor = useBulkMonitorEpisodeProfile();
	const bulkUnmonitor = useBulkUnmonitorEpisodeProfile();
	const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
		null,
	);

	const sortedEpisodes = [...season.episodes].toSorted(
		(a, b) => b.episodeNumber - a.episodeNumber,
	);

	const fileCount = sortedEpisodes.filter((ep) => ep.hasFile).length;
	const totalCount = sortedEpisodes.length;
	const seasonLabel =
		season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`;

	// Compute per-profile monitoring state for this season
	const activeProfileIds = downloadProfiles
		.filter(
			(p) =>
				totalCount > 0 &&
				sortedEpisodes.every((ep) => ep.downloadProfileIds.includes(p.id)),
		)
		.map((p) => p.id);

	const partialProfileIds = downloadProfiles
		.filter(
			(p) =>
				!activeProfileIds.includes(p.id) &&
				sortedEpisodes.some((ep) => ep.downloadProfileIds.includes(p.id)),
		)
		.map((p) => p.id);

	const handleSeasonProfileToggle = (profileId: number) => {
		const isActive = activeProfileIds.includes(profileId);
		if (isActive) {
			setUnmonitorProfileId(profileId);
		} else {
			const episodeIds = sortedEpisodes.map((ep) => ep.id);
			bulkMonitor.mutate(
				{ episodeIds, downloadProfileId: profileId },
				{ onSuccess: () => router.invalidate() },
			);
		}
	};

	const handleUnmonitorConfirm = (deleteFiles: boolean) => {
		if (unmonitorProfileId === null) {
			return;
		}
		const episodeIds = sortedEpisodes.map((ep) => ep.id);
		bulkUnmonitor.mutate(
			{ episodeIds, downloadProfileId: unmonitorProfileId, deleteFiles },
			{
				onSuccess: () => {
					setUnmonitorProfileId(null);
					router.invalidate();
				},
			},
		);
	};

	// Color the progress based on completeness
	let progressColor = "text-muted-foreground";
	if (totalCount > 0) {
		if (fileCount === totalCount) {
			progressColor = "text-green-500";
		} else if (fileCount > 0) {
			progressColor = "text-yellow-500";
		}
	}

	return (
		<>
			<AccordionItem className="group relative" value={`season-${season.id}`}>
				<div className="relative">
					<AccordionTrigger className="absolute inset-0 z-10 h-full w-full justify-start px-3 py-4 hover:no-underline [&>svg]:hidden">
						<span className="sr-only">
							{seasonLabel}, {totalCount} episode{totalCount === 1 ? "" : "s"},{" "}
							{fileCount}/{totalCount} files
						</span>
					</AccordionTrigger>
					<div className="relative z-20 flex items-center gap-4 px-3 py-4 pointer-events-none">
						{downloadProfiles.length > 0 && (
							<div className="pointer-events-auto">
								<ProfileToggleIcons
									profiles={downloadProfiles}
									activeProfileIds={activeProfileIds}
									partialProfileIds={partialProfileIds}
									onToggle={handleSeasonProfileToggle}
									size="sm"
									direction="horizontal"
								/>
							</div>
						)}
						<span className="font-medium">{seasonLabel}</span>
						<span className="text-muted-foreground text-xs">
							{totalCount} episode{totalCount === 1 ? "" : "s"}
						</span>
						<span className={cn("text-xs font-mono", progressColor)}>
							{fileCount}/{totalCount}
						</span>
						<ChevronDownIcon className="pointer-events-none ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
					</div>
				</div>
				<AccordionContent className="px-0 pb-0">
					{/* Column headers — no header for monitor column */}
					<div className="flex items-center gap-4 px-3 py-1.5 text-xs text-muted-foreground border-b font-medium">
						<span className="w-14 shrink-0" />
						<span className="w-20 shrink-0">#</span>
						<span className="flex-1 min-w-0">Title</span>
						<span className="w-28 shrink-0 text-right">Air Date</span>
						<span className="w-12 shrink-0 text-right">Time</span>
						<span className="w-8 shrink-0 text-center">File</span>
					</div>
					{sortedEpisodes.map((episode) => (
						<EpisodeRow
							key={episode.id}
							episode={episode}
							seriesType={seriesType}
							downloadProfiles={downloadProfiles}
						/>
					))}
				</AccordionContent>
			</AccordionItem>

			<UnmonitorDialog
				open={unmonitorProfileId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setUnmonitorProfileId(null);
					}
				}}
				profileName={
					downloadProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
				}
				itemTitle={seasonLabel}
				itemType="season"
				fileCount={0}
				onConfirm={handleUnmonitorConfirm}
				isPending={bulkUnmonitor.isPending}
			/>
		</>
	);
}
