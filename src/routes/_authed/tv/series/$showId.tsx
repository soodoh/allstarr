import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type { JSX } from "react";
import NotFound from "src/components/NotFound";
import { SKELETON_KEYS } from "src/components/shared/loading-skeleton";
import SeasonAccordion from "src/components/tv/season-accordion";
import ShowDetailHeader from "src/components/tv/show-detail-header";
import { Accordion } from "src/components/ui/accordion";
import { Card, CardContent } from "src/components/ui/card";
import Skeleton from "src/components/ui/skeleton";
import { downloadProfilesListQuery, showDetailQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/tv/series/$showId")({
	loader: async ({ params, context }) => {
		const id = Number(params.showId);
		if (!Number.isFinite(id) || id <= 0) {
			throw notFound();
		}
		const [show] = await Promise.all([
			context.queryClient
				.ensureQueryData(showDetailQuery(id))
				.catch((error) => {
					if (error instanceof Error && error.message.includes("not found")) {
						throw notFound();
					}
					throw error;
				}),
			context.queryClient.ensureQueryData(downloadProfilesListQuery()),
		]);
		if (!show) {
			throw notFound();
		}
	},
	component: ShowDetailPage,
	notFoundComponent: NotFound,
	pendingComponent: ShowDetailSkeleton,
});

function ShowDetailPage(): JSX.Element {
	const { showId } = Route.useParams();

	const { data: show } = useSuspenseQuery(showDetailQuery(Number(showId)));
	const { data: downloadProfiles } = useSuspenseQuery(
		downloadProfilesListQuery(),
	);

	if (!show) {
		return <NotFound />;
	}

	// Sort seasons: regular seasons descending, specials (season 0) at the end
	const sortedSeasons = [...show.seasons].toSorted((a, b) => {
		if (a.seasonNumber === 0) {
			return 1;
		}
		if (b.seasonNumber === 0) {
			return -1;
		}
		return b.seasonNumber - a.seasonNumber;
	});

	const tvDownloadProfiles = downloadProfiles.filter(
		(p) => p.contentType === "tv" && show.downloadProfileIds.includes(p.id),
	);

	return (
		<div className="space-y-6">
			<ShowDetailHeader show={show} downloadProfiles={downloadProfiles} />

			{/* Seasons */}
			<Card>
				<CardContent className="p-0">
					<Accordion type="multiple" className="w-full">
						{sortedSeasons.map((season) => (
							<SeasonAccordion
								key={season.id}
								season={season}
								seriesType={show.seriesType}
								downloadProfiles={tvDownloadProfiles}
							/>
						))}
					</Accordion>
				</CardContent>
			</Card>
		</div>
	);
}

function ShowDetailSkeleton(): JSX.Element {
	return (
		<div className="space-y-6">
			{/* Back link */}
			<Skeleton className="h-5 w-36" />

			{/* Page header */}
			<div className="flex justify-between items-start">
				<div>
					<Skeleton className="h-8 w-64 mb-2" />
					<Skeleton className="h-4 w-40" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-9 w-20" />
					<Skeleton className="h-9 w-20" />
				</div>
			</div>

			{/* Three-column layout */}
			<div className="flex flex-col gap-6 xl:flex-row">
				<Skeleton className="w-full xl:w-44 aspect-[2/3] xl:aspect-auto xl:h-64 rounded-lg shrink-0" />
				<Card className="w-full xl:w-72 xl:shrink-0">
					<CardContent className="pt-6 space-y-3">
						{SKELETON_KEYS.slice(0, 8).map((key) => (
							<div key={key} className="flex justify-between gap-4">
								<Skeleton className="h-4 w-20" />
								<Skeleton className="h-4 w-24" />
							</div>
						))}
					</CardContent>
				</Card>
				<Card className="w-full xl:flex-1">
					<CardContent className="pt-6 space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</CardContent>
				</Card>
			</div>

			{/* Seasons accordion */}
			<Card>
				<CardContent className="pt-6 space-y-4">
					{SKELETON_KEYS.slice(0, 3).map((key) => (
						<div
							key={key}
							className="flex items-center gap-4 py-3 border-b last:border-b-0"
						>
							<Skeleton className="h-5 w-24" />
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-12" />
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
