// src/components/tv/episode-group-accordion.tsx

import { useQueries, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "src/components/ui/accordion";
import { Badge } from "src/components/ui/badge";
import Label from "src/components/ui/label";
import {
	getTmdbEpisodeGroupDetailFn,
	getTmdbEpisodeGroupsFn,
	getTmdbSeasonDetailFn,
	getTmdbShowDetailFn,
} from "src/server/tmdb/shows";
import type {
	EpisodeGroupType,
	TmdbEpisodeGroup,
	TmdbEpisodeGroupSummary,
} from "src/server/tmdb/types";
import { EPISODE_GROUP_TYPES } from "src/server/tmdb/types";

const TMDB_DEFAULT_VALUE = "__default__";

// ── Anime detection & recommendation (ported from episode-group-selector.tsx) ──

function isAnime(originCountry: string[], genreIds: number[]): boolean {
	return originCountry.includes("JP") && genreIds.includes(16);
}

const ANIME_RECOMMENDED_TYPES: EpisodeGroupType[] = [6, 1, 7];

function getRecommendedGroup(
	groups: TmdbEpisodeGroupSummary[],
	anime: boolean,
): string | null {
	if (!anime) {
		return null;
	}
	for (const preferredType of ANIME_RECOMMENDED_TYPES) {
		const candidates = groups
			.filter((g) => g.type === preferredType)
			.toSorted((a, b) => b.episode_count - a.episode_count);
		if (candidates.length > 0) {
			return candidates[0].id;
		}
	}
	return null;
}

// ── Season row data ──

type SeasonRow = {
	name: string;
	episodeCount: number;
	startEp: number;
	endEp: number;
};

/** Build season rows from an episode group detail (uses order+1 as episode number). */
function buildGroupSeasonRows(groups: TmdbEpisodeGroup[]): SeasonRow[] {
	return groups.map((group) => {
		const episodes = group.episodes.toSorted((a, b) => a.order - b.order);
		const first = episodes[0];
		const last = episodes.at(-1);
		return {
			name: group.name,
			episodeCount: episodes.length,
			startEp: first ? first.order + 1 : 1,
			endEp: last ? last.order + 1 : episodes.length,
		};
	});
}

/** Zero-pad a number to at least 2 digits. */
function pad(n: number): string {
	return String(n).padStart(2, "0");
}

const EMPTY_ROWS: SeasonRow[] = [];

// ── Display Components ──

function SeasonRows({
	rows,
	isLoading,
}: {
	rows: SeasonRow[];
	isLoading: boolean;
}): JSX.Element {
	if (isLoading) {
		return (
			<div className="flex items-center gap-2 py-2 text-muted-foreground">
				<Loader2 className="h-3 w-3 animate-spin" />
				<span className="text-xs">Loading seasons...</span>
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<p className="text-xs text-muted-foreground py-1">
				No season data available.
			</p>
		);
	}

	return (
		<div className="space-y-0.5">
			{rows.map((row) => (
				<div
					key={row.name}
					className="flex items-center justify-between text-xs text-muted-foreground"
				>
					<span className="text-foreground">{row.name}</span>
					<div className="flex items-center gap-3">
						<span className="font-mono text-[11px]">
							E{pad(row.startEp)}–E{pad(row.endEp)}
						</span>
						<span>{row.episodeCount} eps</span>
					</div>
				</div>
			))}
		</div>
	);
}

function DefaultSeasonsContent({
	tmdbId,
	seasons,
	isExpanded,
}: {
	tmdbId: number;
	seasons: Array<{
		season_number: number;
		name: string;
		episode_count: number;
	}>;
	isExpanded: boolean;
}): JSX.Element {
	// Filter out specials (season 0) and sort
	const regularSeasons = useMemo(
		() =>
			seasons
				.filter((s) => s.season_number > 0)
				.toSorted((a, b) => a.season_number - b.season_number),
		[seasons],
	);

	// Fetch all season details in parallel when expanded
	const seasonQueries = useQueries({
		queries: regularSeasons.map((s) => ({
			queryKey: ["tmdb", "season-detail", tmdbId, s.season_number],
			queryFn: () =>
				getTmdbSeasonDetailFn({
					data: { tmdbId, seasonNumber: s.season_number },
				}),
			enabled: isExpanded,
		})),
	});

	const isLoading = seasonQueries.some((q) => q.isLoading);

	const rows: SeasonRow[] = useMemo(() => {
		if (isLoading) {
			return [];
		}
		return regularSeasons.map((s, i) => {
			const detail = seasonQueries[i]?.data;
			if (!detail || detail.episodes.length === 0) {
				return {
					name: s.name,
					episodeCount: s.episode_count,
					startEp: 1,
					endEp: s.episode_count,
				};
			}
			const sorted = detail.episodes.toSorted(
				(a, b) => a.episode_number - b.episode_number,
			);
			return {
				name: s.name,
				episodeCount: sorted.length,
				startEp: sorted[0].episode_number,
				endEp: (sorted.at(-1) ?? sorted[0]).episode_number,
			};
		});
	}, [isLoading, regularSeasons, seasonQueries]);

	return <SeasonRows rows={rows} isLoading={isLoading} />;
}

type EpisodeGroupItemProps = {
	group: TmdbEpisodeGroupSummary;
	isSelected: boolean;
	isRecommended: boolean;
	isExpanded: boolean;
};

function EpisodeGroupItem({
	group,
	isSelected,
	isRecommended,
	isExpanded,
}: EpisodeGroupItemProps): JSX.Element {
	// Lazy-fetch group detail only when expanded or selected
	const { data: detail, isLoading: detailLoading } = useQuery({
		queryKey: ["tmdb", "episode-group-detail", group.id],
		queryFn: () => getTmdbEpisodeGroupDetailFn({ data: { groupId: group.id } }),
		enabled: isExpanded || isSelected,
	});

	const seasonRows = useMemo(
		() => (detail ? buildGroupSeasonRows(detail.groups) : []),
		[detail],
	);

	return (
		<AccordionItem value={group.id}>
			<AccordionTrigger className="px-3 py-2.5 hover:no-underline">
				<div className="flex items-center gap-2 flex-wrap">
					<div
						className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
							isSelected ? "border-foreground" : "border-muted-foreground/50"
						}`}
					>
						{isSelected && (
							<div className="h-2 w-2 rounded-full bg-foreground" />
						)}
					</div>
					<span className="font-medium">{group.name}</span>
					<Badge variant="outline" className="text-xs font-normal">
						{EPISODE_GROUP_TYPES[group.type]}
					</Badge>
					<Badge variant="secondary" className="text-xs font-normal">
						{group.group_count} seasons · {group.episode_count} eps
					</Badge>
					{isRecommended && (
						<Badge className="bg-emerald-900 text-emerald-300 text-xs font-normal">
							Recommended
						</Badge>
					)}
				</div>
			</AccordionTrigger>
			<AccordionContent className="px-3">
				<SeasonRows rows={seasonRows} isLoading={detailLoading} />
			</AccordionContent>
		</AccordionItem>
	);
}

// ── Main Component ──

type EpisodeGroupAccordionProps = {
	tmdbId: number;
	originCountry: string[];
	genreIds: number[];
	value: string | null;
	onChange: (groupId: string | null) => void;
	isAnimeOverride?: boolean;
};

export default function EpisodeGroupAccordion({
	tmdbId,
	originCountry,
	genreIds,
	value,
	onChange,
	isAnimeOverride,
}: EpisodeGroupAccordionProps): JSX.Element | null {
	// Track which accordion item is expanded (independent of selection)
	const [expandedItem, setExpandedItem] = useState<string>("");

	// ── Data fetching ──

	const { data: groups = [], isLoading: groupsLoading } = useQuery({
		queryKey: ["tmdb", "episode-groups", tmdbId],
		queryFn: () => getTmdbEpisodeGroupsFn({ data: { tmdbId } }),
		enabled: tmdbId > 0,
	});

	const { data: showDetail, isLoading: showDetailLoading } = useQuery({
		queryKey: ["tmdb", "show-detail", tmdbId],
		queryFn: () => getTmdbShowDetailFn({ data: { tmdbId } }),
		enabled: tmdbId > 0,
	});

	// ── Anime detection & recommendation ──

	const anime = useMemo(
		() =>
			isAnimeOverride === undefined
				? isAnime(originCountry, genreIds)
				: isAnimeOverride,
		[isAnimeOverride, originCountry, genreIds],
	);

	const recommendedId = useMemo(
		() => getRecommendedGroup(groups, anime),
		[groups, anime],
	);

	// Preselect recommended group on first load (add flow only — when value is null
	// and no user interaction has happened yet)
	const [hasPreselected, setHasPreselected] = useState(false);
	useEffect(() => {
		if (hasPreselected || groups.length === 0) {
			return;
		}
		setHasPreselected(true);

		// Only preselect if no value is currently set (add flow)
		if (value !== null) {
			// Edit flow: expand the current selection
			setExpandedItem(value);
			return;
		}

		if (recommendedId === null) {
			// Non-anime: default is recommended, expand it
			setExpandedItem(TMDB_DEFAULT_VALUE);
		} else {
			onChange(recommendedId);
			setExpandedItem(recommendedId);
		}
	}, [groups, recommendedId, value, hasPreselected, onChange]);

	// ── TMDB Default header counts ──

	const defaultSeasons = useMemo(
		() =>
			showDetail
				? showDetail.seasons
						.filter((s) => s.season_number > 0)
						.toSorted((a, b) => a.season_number - b.season_number)
				: [],
		[showDetail],
	);

	const defaultTotalEps = useMemo(
		() => defaultSeasons.reduce((sum, s) => sum + s.episode_count, 0),
		[defaultSeasons],
	);

	// ── Render ──

	if (groupsLoading || groups.length === 0) {
		return null;
	}

	const isDefaultRecommended = !anime || recommendedId === null;
	const selectedValue = value ?? TMDB_DEFAULT_VALUE;

	const handleValueChange = (newValue: string) => {
		// When expanding a new item, also select it
		if (newValue) {
			const groupId = newValue === TMDB_DEFAULT_VALUE ? null : newValue;
			onChange(groupId);
		}
		setExpandedItem(newValue);
	};

	return (
		<div className="space-y-2">
			<Label>Episode Ordering</Label>
			<Accordion
				type="single"
				collapsible
				value={expandedItem}
				onValueChange={handleValueChange}
				className="rounded-lg border"
			>
				{/* TMDB Default */}
				<AccordionItem value={TMDB_DEFAULT_VALUE}>
					<AccordionTrigger className="px-3 py-2.5 hover:no-underline">
						<div className="flex items-center gap-2 flex-wrap">
							<div
								className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
									selectedValue === TMDB_DEFAULT_VALUE
										? "border-foreground"
										: "border-muted-foreground/50"
								}`}
							>
								{selectedValue === TMDB_DEFAULT_VALUE && (
									<div className="h-2 w-2 rounded-full bg-foreground" />
								)}
							</div>
							<span className="font-medium">TMDB Default</span>
							{!showDetailLoading && (
								<Badge variant="secondary" className="text-xs font-normal">
									{defaultSeasons.length} seasons · {defaultTotalEps} eps
								</Badge>
							)}
							{isDefaultRecommended && (
								<Badge className="bg-emerald-900 text-emerald-300 text-xs font-normal">
									Recommended
								</Badge>
							)}
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-3">
						{showDetail ? (
							<DefaultSeasonsContent
								tmdbId={tmdbId}
								seasons={showDetail.seasons}
								isExpanded={expandedItem === TMDB_DEFAULT_VALUE}
							/>
						) : (
							<SeasonRows rows={EMPTY_ROWS} isLoading={showDetailLoading} />
						)}
					</AccordionContent>
				</AccordionItem>

				{/* Episode groups */}
				{groups.map((group) => (
					<EpisodeGroupItem
						key={group.id}
						group={group}
						isSelected={selectedValue === group.id}
						isRecommended={group.id === recommendedId}
						isExpanded={expandedItem === group.id}
					/>
				))}
			</Accordion>
		</div>
	);
}
