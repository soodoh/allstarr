import { useQuery } from "@tanstack/react-query";
import { Search, Star, Tv } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "src/components/shared/empty-state";
import OptimizedImage from "src/components/shared/optimized-image";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import EpisodeGroupAccordion from "src/components/tv/episode-group-accordion";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import Checkbox from "src/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import Switch from "src/components/ui/switch";
import { useAddShow } from "src/hooks/mutations/shows";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { showExistenceQuery } from "src/lib/queries/shows";
import { tmdbSearchShowsQuery } from "src/lib/queries/tmdb";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import { resizeTmdbUrl } from "src/lib/utils";
import type { TmdbTvResult } from "src/server/tmdb/types";

function extractYear(firstAirDate: string): string | null {
	if (!firstAirDate) {
		return null;
	}
	const year = firstAirDate.split("-")[0];
	return year && year.length === 4 ? year : null;
}

// ── Monitor Options ───────────────────────────────────────────────────────

const MONITOR_OPTIONS = [
	{ value: "all", label: "All Seasons" },
	{ value: "future", label: "Future Episodes" },
	{ value: "missing", label: "Missing Episodes" },
	{ value: "existing", label: "Existing Episodes" },
	{ value: "pilot", label: "Pilot Only" },
	{ value: "firstSeason", label: "First Season" },
	{ value: "lastSeason", label: "Last Season" },
	{ value: "none", label: "None" },
] as const;

const SERIES_TYPES = [
	{
		value: "standard",
		label: "Standard",
		description: "Season and episode numbers (S01E05)",
	},
	{ value: "daily", label: "Daily / Date", description: "Date (2020-05-25)" },
	{
		value: "anime",
		label: "Anime / Absolute",
		description: "Absolute episode number (005)",
	},
] as const;

// ── Preview Modal ─────────────────────────────────────────────────────────

type ShowPreviewModalProps = {
	show: TmdbTvResult;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	addDefaults?: Record<string, unknown> | null;
};

function ShowPreviewModal({
	show,
	open,
	onOpenChange,
	addDefaults,
}: ShowPreviewModalProps): JSX.Element {
	const addShow = useAddShow();
	const upsertSettings = useUpsertUserSettings();

	const { data: alreadyExists = false } = useQuery({
		...showExistenceQuery(show.id),
		enabled: open && show.id > 0,
	});

	const { data: allProfiles } = useQuery({
		...downloadProfilesListQuery(),
		enabled: open,
	});

	const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
		() => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
	);
	const [monitorOption, setMonitorOption] = useState<string>(
		() => (addDefaults?.monitorOption as string | undefined) ?? "all",
	);
	const [seriesType, setSeriesType] = useState<string>("standard");
	const [useSeasonFolder, setSeasonFolder] = useState(
		() => (addDefaults?.useSeasonFolder as boolean | undefined) ?? true,
	);
	const [searchOnAdd, setSearchOnAdd] = useState(
		() => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
	);
	const [searchCutoffUnmet, setSearchCutoffUnmet] = useState(
		() => (addDefaults?.searchCutoffUnmet as boolean | undefined) ?? false,
	);
	const [episodeGroupId, setEpisodeGroupId] = useState<string | null>(null);

	const tvProfiles = useMemo(
		() => (allProfiles ?? []).filter((p) => p.contentType === "tv"),
		[allProfiles],
	);

	const toggleProfile = (id: number) => {
		setDownloadProfileIds((prev) =>
			prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
		);
	};

	const year = extractYear(show.first_air_date);

	const handleAdd = () => {
		if (downloadProfileIds.length === 0) {
			return;
		}
		upsertSettings.mutate({
			tableId: "tv",
			addDefaults: {
				downloadProfileIds,
				monitorOption,
				useSeasonFolder,
				searchOnAdd,
				searchCutoffUnmet,
			},
		});
		addShow.mutate(
			{
				tmdbId: show.id,
				downloadProfileIds,
				monitorOption: monitorOption as
					| "all"
					| "future"
					| "missing"
					| "existing"
					| "pilot"
					| "firstSeason"
					| "lastSeason"
					| "none",
				seriesType: seriesType as "standard" | "daily" | "anime",
				useSeasonFolder,
				searchOnAdd,
				searchCutoffUnmet,
				episodeGroupId,
			},
			{
				onSuccess: () => {
					onOpenChange(false);
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-2xl max-h-[85vh] overflow-y-auto"
				onClick={(e) => e.stopPropagation()}
			>
				<DialogHeader>
					<DialogTitle className="sr-only">{show.name}</DialogTitle>
					<DialogDescription className="sr-only">
						Add {show.name} to your library
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Poster + title row */}
					<div className="flex gap-4">
						<OptimizedImage
							src={resizeTmdbUrl(show.poster_path ?? null, "w342")}
							alt={`${show.name} poster`}
							type="show"
							width={128}
							height={192}
							className="h-48 w-32 shrink-0 rounded"
						/>

						<div className="min-w-0 flex-1 space-y-2">
							<h2 className="text-xl font-semibold leading-tight">
								{show.name}
								{year && (
									<span className="ml-2 text-base font-normal text-muted-foreground">
										({year})
									</span>
								)}
							</h2>

							<div className="flex flex-wrap items-center gap-2">
								{show.vote_average > 0 && (
									<Badge variant="secondary" className="gap-1">
										<Star className="h-3 w-3" />
										{show.vote_average.toFixed(1)}
									</Badge>
								)}
								{show.popularity > 0 && (
									<Badge variant="outline">
										Popularity: {Math.round(show.popularity)}
									</Badge>
								)}
								{show.origin_country.map((country) => (
									<Badge key={country} variant="outline" className="text-xs">
										{country}
									</Badge>
								))}
								{alreadyExists && <Badge>Already in library</Badge>}
							</div>

							{show.overview && (
								<p className="text-sm text-muted-foreground leading-relaxed">
									{show.overview}
								</p>
							)}
						</div>
					</div>

					{/* Add form */}
					{!alreadyExists && (
						<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
							<ProfileCheckboxGroup
								profiles={tvProfiles}
								selectedIds={downloadProfileIds}
								onToggle={toggleProfile}
							/>

							<div className="space-y-2">
								<Label>Monitoring</Label>
								<Select value={monitorOption} onValueChange={setMonitorOption}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{MONITOR_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label>Series Type</Label>
								<Select value={seriesType} onValueChange={setSeriesType}>
									<SelectTrigger className="w-full text-left">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SERIES_TYPES.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												<div>
													<div>{opt.label}</div>
													<div className="text-xs text-muted-foreground">
														{opt.description}
													</div>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<EpisodeGroupAccordion
								tmdbId={show.id}
								originCountry={show.origin_country}
								genreIds={show.genre_ids}
								value={episodeGroupId}
								onChange={setEpisodeGroupId}
							/>

							<div className="flex items-center justify-between">
								<Label htmlFor="season-folder">Use Season Folder</Label>
								<Switch
									id="season-folder"
									checked={useSeasonFolder}
									onCheckedChange={setSeasonFolder}
								/>
							</div>

							<div className="flex items-center gap-2">
								<Checkbox
									id="search-on-add"
									checked={searchOnAdd}
									onCheckedChange={(checked) =>
										setSearchOnAdd(checked === true)
									}
								/>
								<Label htmlFor="search-on-add">
									Start search for missing episodes
								</Label>
							</div>

							<div className="flex items-center gap-2">
								<Checkbox
									id="search-cutoff-unmet"
									checked={searchCutoffUnmet}
									onCheckedChange={(checked) =>
										setSearchCutoffUnmet(checked === true)
									}
								/>
								<Label htmlFor="search-cutoff-unmet">
									Start search for cutoff unmet episodes
								</Label>
							</div>

							<Button
								className="w-full"
								onClick={handleAdd}
								disabled={
									downloadProfileIds.length === 0 ||
									addShow.isPending ||
									tvProfiles.length === 0
								}
							>
								{addShow.isPending ? "Adding..." : "Add Show"}
							</Button>
						</div>
					)}

					{alreadyExists && (
						<Button
							variant="secondary"
							className="w-full"
							onClick={() => {
								onOpenChange(false);
							}}
						>
							Close
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ── Result Card ───────────────────────────────────────────────────────────

function ShowResultCard({
	show,
	onClick,
}: {
	show: TmdbTvResult;
	onClick: (show: TmdbTvResult) => void;
}): JSX.Element {
	const year = extractYear(show.first_air_date);

	return (
		<button
			type="button"
			className="block w-full text-left"
			onClick={() => onClick(show)}
		>
			<Card className="py-0 overflow-hidden hover:bg-accent/50 transition-colors cursor-pointer">
				<CardContent className="p-4">
					<div className="flex gap-4">
						<OptimizedImage
							src={resizeTmdbUrl(show.poster_path ?? null, "w185")}
							alt={`${show.name} poster`}
							type="show"
							width={64}
							height={96}
							className="h-24 w-16 shrink-0 rounded"
						/>

						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								{year && <Badge variant="outline">{year}</Badge>}
								{show.vote_average > 0 && (
									<Badge variant="secondary" className="gap-1">
										<Star className="h-3 w-3" />
										{show.vote_average.toFixed(1)}
									</Badge>
								)}
								{show.origin_country.map((country) => (
									<Badge key={country} variant="outline" className="text-xs">
										{country}
									</Badge>
								))}
							</div>

							<h3 className="font-semibold leading-tight">{show.name}</h3>

							{show.overview && (
								<p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
									{show.overview}
								</p>
							)}
						</div>
					</div>
				</CardContent>
			</Card>
		</button>
	);
}

// ── Main Search Component ─────────────────────────────────────────────────

export default function TmdbShowSearch(): JSX.Element {
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [previewShow, setPreviewShow] = useState<TmdbTvResult | undefined>(
		undefined,
	);

	const { data: settings } = useQuery(userSettingsQuery("tv"));

	// Debounce the search query
	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedQuery(query.trim());
		}, 300);
		return () => clearTimeout(timeout);
	}, [query]);

	const {
		data: searchData,
		isLoading,
		isError,
		error,
	} = useQuery(tmdbSearchShowsQuery(debouncedQuery));

	const results = searchData?.results ?? [];

	// Determine content to render
	let searchResultsContent: ReactNode;

	if (isError) {
		const message =
			error instanceof Error ? error.message : "Search request failed.";
		const isMissingKey =
			message.toLowerCase().includes("api key") ||
			message.toLowerCase().includes("tmdb") ||
			message.toLowerCase().includes("unauthorized");
		searchResultsContent = (
			<EmptyState
				icon={Tv}
				title="Search failed"
				description={
					isMissingKey
						? "Configure your TMDB API key in Settings > Metadata to search for TV shows."
						: message
				}
			/>
		);
	} else if (!debouncedQuery || debouncedQuery.length < 2) {
		searchResultsContent = (
			<EmptyState
				icon={Search}
				title="Search for a TV show"
				description="Enter a show title above to search TMDB."
			/>
		);
	} else if (isLoading) {
		searchResultsContent = (
			<Card>
				<CardContent className="py-8">
					<p className="text-sm text-muted-foreground">Searching TMDB...</p>
				</CardContent>
			</Card>
		);
	} else if (results.length === 0) {
		searchResultsContent = (
			<EmptyState
				icon={Search}
				title="No results found"
				description={`No TV shows found for "${debouncedQuery}".`}
			/>
		);
	} else {
		searchResultsContent = (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					Showing {results.length} result{results.length === 1 ? "" : "s"} for
					&ldquo;{debouncedQuery}&rdquo;.
				</p>
				<div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
					{results.map((show) => (
						<ShowResultCard
							key={show.id}
							show={show}
							onClick={setPreviewShow}
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search for a TV show by title..."
					autoComplete="off"
					aria-label="Search TV shows"
					className="pl-9"
					autoFocus
				/>
			</div>

			<div className="mt-4">{searchResultsContent}</div>

			{previewShow && (
				<ShowPreviewModal
					show={previewShow}
					open={Boolean(previewShow)}
					onOpenChange={(open) => {
						if (!open) {
							setPreviewShow(undefined);
						}
					}}
					addDefaults={settings?.addDefaults}
				/>
			)}
		</>
	);
}
