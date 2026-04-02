import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type { JSX } from "react";
import MangaDetailHeader from "src/components/manga/manga-detail-header";
import VolumeAccordion from "src/components/manga/volume-accordion";
import NotFound from "src/components/NotFound";
import { SKELETON_KEYS } from "src/components/shared/loading-skeleton";
import { Accordion } from "src/components/ui/accordion";
import { Card, CardContent } from "src/components/ui/card";
import Skeleton from "src/components/ui/skeleton";
import type { DisplayVolume } from "src/lib/manga-display-utils";
import { splitUngroupedVolumes } from "src/lib/manga-display-utils";
import { mangaDetailQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/manga/series/$mangaId")({
	loader: async ({ params, context }) => {
		const id = Number(params.mangaId);
		if (!Number.isFinite(id) || id <= 0) {
			throw notFound();
		}
		const mangaData = await context.queryClient
			.ensureQueryData(mangaDetailQuery(id))
			.catch((error) => {
				if (error instanceof Error && error.message.includes("not found")) {
					throw notFound();
				}
				throw error;
			});
		if (!mangaData) {
			throw notFound();
		}
	},
	component: MangaDetailPage,
	notFoundComponent: NotFound,
	pendingComponent: MangaDetailSkeleton,
});

function MangaDetailPage(): JSX.Element {
	const { mangaId } = Route.useParams();

	const { data: mangaData } = useSuspenseQuery(
		mangaDetailQuery(Number(mangaId)),
	);

	if (!mangaData) {
		return <NotFound />;
	}

	// Split ungrouped chapters into positional groups interleaved with known volumes
	const displayGroups = splitUngroupedVolumes(
		mangaData.volumes as DisplayVolume[],
	);

	return (
		<div className="space-y-6">
			<MangaDetailHeader manga={mangaData} />

			{/* Volumes */}
			<Card>
				<CardContent className="p-0">
					<Accordion type="multiple" className="w-full">
						{displayGroups.map((group) => (
							<VolumeAccordion
								key={group.key}
								volume={
									group.volume ?? {
										id: -1,
										volumeNumber: null,
										title: null,
										chapters: group.chapters,
									}
								}
								displayTitle={group.displayTitle}
								accordionValue={group.key}
							/>
						))}
					</Accordion>
				</CardContent>
			</Card>
		</div>
	);
}

function MangaDetailSkeleton(): JSX.Element {
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

			{/* Volumes accordion */}
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
