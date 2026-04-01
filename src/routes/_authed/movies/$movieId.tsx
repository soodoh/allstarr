import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type { JSX } from "react";
import { useState } from "react";
import MovieDetailHeader from "src/components/movies/movie-detail-header";
import MovieFilesTab from "src/components/movies/movie-files-tab";
import NotFound from "src/components/NotFound";
import { Card, CardContent } from "src/components/ui/card";
import Skeleton from "src/components/ui/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "src/components/ui/tabs";
import { downloadProfilesListQuery, movieDetailQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/movies/$movieId")({
	loader: async ({ params, context }) => {
		const id = Number(params.movieId);
		if (!Number.isFinite(id) || id <= 0) {
			throw notFound();
		}
		const [movie] = await Promise.all([
			context.queryClient
				.ensureQueryData(movieDetailQuery(id))
				.catch((error) => {
					if (error instanceof Error && error.message.includes("not found")) {
						throw notFound();
					}
					throw error;
				}),
			context.queryClient.ensureQueryData(downloadProfilesListQuery()),
		]);
		if (!movie) {
			throw notFound();
		}
	},
	component: MovieDetailPage,
	notFoundComponent: NotFound,
	pendingComponent: MovieDetailSkeleton,
});

function MovieDetailPage(): JSX.Element {
	const { movieId } = Route.useParams();
	const [activeTab, setActiveTab] = useState("overview");

	const { data: movie } = useSuspenseQuery(movieDetailQuery(Number(movieId)));
	const { data: downloadProfiles } = useSuspenseQuery(
		downloadProfilesListQuery(),
	);

	if (!movie) {
		return <NotFound />;
	}

	return (
		<div className="space-y-6">
			<MovieDetailHeader movie={movie} downloadProfiles={downloadProfiles} />

			{/* Tabs */}
			<Card>
				<CardContent className="p-0">
					<Tabs
						value={activeTab}
						onValueChange={setActiveTab}
						className="flex flex-col"
					>
						<TabsList className="m-4 mb-0">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="files">Files</TabsTrigger>
						</TabsList>

						<div className="p-4">
							<TabsContent value="overview" className="mt-0">
								<div className="text-sm leading-relaxed">
									{movie.overview ? (
										<p>{movie.overview}</p>
									) : (
										<p className="text-muted-foreground">
											No overview available.
										</p>
									)}
								</div>
							</TabsContent>

							<TabsContent value="files" className="mt-0">
								<MovieFilesTab files={movie.files} />
							</TabsContent>
						</div>
					</Tabs>
				</CardContent>
			</Card>
		</div>
	);
}

function MovieDetailSkeleton(): JSX.Element {
	return (
		<div className="space-y-6">
			{/* Back link */}
			<Skeleton className="h-5 w-32" />

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
						{Array.from({ length: 7 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							<div key={i} className="flex justify-between gap-4">
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

			{/* Tabs */}
			<Card>
				<CardContent className="pt-6 space-y-4">
					<div className="flex gap-2">
						<Skeleton className="h-9 w-24" />
						<Skeleton className="h-9 w-20" />
					</div>
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</CardContent>
			</Card>
		</div>
	);
}
