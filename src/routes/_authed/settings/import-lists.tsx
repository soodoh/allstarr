import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ListPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import EmptyState from "src/components/shared/empty-state";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "src/components/ui/tabs";
import { queryKeys } from "src/lib/query-keys";
import {
	getBookImportExclusionsFn,
	getMovieImportExclusionsFn,
	removeBookImportExclusionFn,
	removeMovieImportExclusionFn,
} from "src/server/import-list-exclusions";

export const Route = createFileRoute("/_authed/settings/import-lists")({
	component: ImportListsPage,
});

function ImportListsPage() {
	const queryClient = useQueryClient();

	// Book exclusions state
	const [bookConfirmId, setBookConfirmId] = useState<number | null>(null);

	const { data: bookData } = useQuery({
		queryKey: queryKeys.importExclusions.books(),
		queryFn: () => getBookImportExclusionsFn({ data: { page: 1, limit: 50 } }),
	});

	const bookItems = bookData?.items ?? [];

	const removeBookMutation = useMutation({
		mutationFn: (id: number) => removeBookImportExclusionFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.importExclusions.books(),
			});
			toast.success("Exclusion removed");
			setBookConfirmId(null);
		},
		onError: () => {
			toast.error("Failed to remove exclusion");
		},
	});

	// Movie exclusions state
	const [movieConfirmId, setMovieConfirmId] = useState<number | null>(null);

	const { data: movieData } = useQuery({
		queryKey: queryKeys.importExclusions.movies(),
		queryFn: () => getMovieImportExclusionsFn({ data: { page: 1, limit: 50 } }),
	});

	const movieItems = movieData?.items ?? [];

	const removeMovieMutation = useMutation({
		mutationFn: (id: number) => removeMovieImportExclusionFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.importExclusions.movies(),
			});
			toast.success("Exclusion removed");
			setMovieConfirmId(null);
		},
		onError: () => {
			toast.error("Failed to remove exclusion");
		},
	});

	return (
		<div>
			<PageHeader
				title="Import Lists"
				description="Manage import lists and exclusions"
			/>

			<Tabs defaultValue="books">
				<TabsList className="mb-4">
					<TabsTrigger value="books">Book Exclusions</TabsTrigger>
					<TabsTrigger value="movies">Movie Exclusions</TabsTrigger>
				</TabsList>

				<TabsContent value="books">
					{bookItems.length === 0 ? (
						<EmptyState
							icon={ListPlus}
							title="No exclusions"
							description="Books excluded from import lists will appear here."
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Title</TableHead>
									<TableHead>Author</TableHead>
									<TableHead>Date Excluded</TableHead>
									<TableHead className="w-[100px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{bookItems.map((item) => (
									<TableRow key={item.id}>
										<TableCell>{item.title}</TableCell>
										<TableCell>{item.authorName}</TableCell>
										<TableCell>
											{new Date(item.createdAt ?? "").toLocaleDateString()}
										</TableCell>
										<TableCell>
											<Button
												variant="destructive"
												size="sm"
												onClick={() => setBookConfirmId(item.id)}
											>
												Remove
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}

					<ConfirmDialog
						open={bookConfirmId !== null}
						onOpenChange={(open) => {
							if (!open) {
								setBookConfirmId(null);
							}
						}}
						title="Remove Exclusion"
						description="Are you sure you want to remove this exclusion? The book may be imported again."
						onConfirm={() => {
							if (bookConfirmId !== null) {
								removeBookMutation.mutate(bookConfirmId);
							}
						}}
						loading={removeBookMutation.isPending}
					/>
				</TabsContent>

				<TabsContent value="movies">
					{movieItems.length === 0 ? (
						<EmptyState
							icon={ListPlus}
							title="No exclusions"
							description="Movies excluded from import lists will appear here."
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Title</TableHead>
									<TableHead>Year</TableHead>
									<TableHead>Date Excluded</TableHead>
									<TableHead className="w-[100px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{movieItems.map((item) => (
									<TableRow key={item.id}>
										<TableCell>{item.title}</TableCell>
										<TableCell>{item.year ?? "—"}</TableCell>
										<TableCell>
											{new Date(item.createdAt ?? "").toLocaleDateString()}
										</TableCell>
										<TableCell>
											<Button
												variant="destructive"
												size="sm"
												onClick={() => setMovieConfirmId(item.id)}
											>
												Remove
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}

					<ConfirmDialog
						open={movieConfirmId !== null}
						onOpenChange={(open) => {
							if (!open) {
								setMovieConfirmId(null);
							}
						}}
						title="Remove Exclusion"
						description="Are you sure you want to remove this exclusion? The movie may be imported again."
						onConfirm={() => {
							if (movieConfirmId !== null) {
								removeMovieMutation.mutate(movieConfirmId);
							}
						}}
						loading={removeMovieMutation.isPending}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
