import { useRouter } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import {
	useMonitorEpisodeProfile,
	useUnmonitorEpisodeProfile,
} from "src/hooks/mutations/episode-profiles";

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

type DownloadProfile = {
	id: number;
	name: string;
	icon: string;
};

type EpisodeRowProps = {
	episode: Episode;
	seriesType: string;
	downloadProfiles: DownloadProfile[];
};

function isUnaired(airDate: string | null): boolean {
	if (!airDate) {
		return true;
	}
	const today = new Date().toISOString().split("T")[0];
	return airDate > today;
}

function formatAirDate(airDate: string | null): string {
	if (!airDate) {
		return "TBA";
	}
	try {
		return new Date(`${airDate}T00:00:00`).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return airDate;
	}
}

export default function EpisodeRow({
	episode,
	seriesType,
	downloadProfiles,
}: EpisodeRowProps): JSX.Element {
	const router = useRouter();
	const monitorProfile = useMonitorEpisodeProfile();
	const unmonitorProfile = useUnmonitorEpisodeProfile();
	const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
		null,
	);

	const unaired = isUnaired(episode.airDate);

	let epLabel = `E${String(episode.episodeNumber).padStart(2, "0")}`;
	if (seriesType === "anime" && episode.absoluteNumber !== null) {
		epLabel += ` (${episode.absoluteNumber})`;
	}

	const handleProfileToggle = (profileId: number) => {
		if (episode.downloadProfileIds.includes(profileId)) {
			setUnmonitorProfileId(profileId);
		} else {
			monitorProfile.mutate(
				{ episodeId: episode.id, downloadProfileId: profileId },
				{ onSuccess: () => router.invalidate() },
			);
		}
	};

	const handleUnmonitorConfirm = (deleteFiles: boolean) => {
		if (unmonitorProfileId === null) {
			return;
		}
		unmonitorProfile.mutate(
			{
				episodeId: episode.id,
				downloadProfileId: unmonitorProfileId,
				deleteFiles,
			},
			{
				onSuccess: () => {
					setUnmonitorProfileId(null);
					router.invalidate();
				},
			},
		);
	};

	return (
		<>
			<div
				className={`flex items-center gap-4 px-3 py-2 text-sm border-b last:border-b-0 ${
					unaired ? "opacity-60" : ""
				}`}
			>
				{/* Monitor icons — leftmost, no header */}
				<span className="w-14 shrink-0">
					{downloadProfiles.length > 0 && (
						<ProfileToggleIcons
							profiles={downloadProfiles}
							activeProfileIds={episode.downloadProfileIds}
							onToggle={handleProfileToggle}
							size="sm"
							direction="horizontal"
						/>
					)}
				</span>

				{/* Episode number */}
				<span className="w-20 shrink-0 font-mono text-muted-foreground">
					{epLabel}
				</span>

				{/* Title */}
				<span className="flex-1 min-w-0 truncate" title={episode.title}>
					{episode.title || "TBA"}
				</span>

				{/* Air date */}
				<span
					className={`w-28 shrink-0 text-right ${
						unaired ? "text-muted-foreground" : ""
					}`}
				>
					{formatAirDate(episode.airDate)}
				</span>

				{/* Runtime */}
				<span className="w-12 shrink-0 text-right text-muted-foreground">
					{episode.runtime ? `${episode.runtime}m` : "-"}
				</span>

				{/* File status */}
				<span className="w-8 shrink-0 flex justify-center">
					{episode.hasFile ? (
						<Check className="h-4 w-4 text-green-500" />
					) : (
						<Minus className="h-4 w-4 text-muted-foreground" />
					)}
				</span>
			</div>

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
				itemTitle={
					episode.title || `E${String(episode.episodeNumber).padStart(2, "0")}`
				}
				itemType="episode"
				fileCount={0}
				onConfirm={handleUnmonitorConfirm}
				isPending={unmonitorProfile.isPending}
			/>
		</>
	);
}
