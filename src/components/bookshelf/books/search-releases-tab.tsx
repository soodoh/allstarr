import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import ReleaseTable from "src/components/bookshelf/books/release-table";
import SearchToolbar from "src/components/bookshelf/books/search-toolbar";
import { TabsContent } from "src/components/ui/tabs";
import { useGrabRelease, useSearchIndexers } from "src/hooks/mutations";
import { bookReleaseStatusQuery } from "src/lib/queries";
import { queryKeys } from "src/lib/query-keys";
import type { IndexerRelease } from "src/server/indexers/types";

type BookData = {
	id: number;
	title: string;
	authorName: string | null;
};

export default function SearchReleasesTab({
	book,
	enabled,
	hasIndexers,
	onNavigateAway,
}: {
	book: BookData;
	enabled: boolean;
	hasIndexers: boolean | undefined;
	onNavigateAway?: () => void;
}): JSX.Element {
	const searchIndexers = useSearchIndexers(book.id);
	const grabRelease = useGrabRelease();
	const queryClient = useQueryClient();
	const hasSearched = useRef(false);

	const defaultQuery = book.authorName
		? `${book.authorName} ${book.title}`
		: book.title;

	const releases = useMemo(
		() => searchIndexers.data?.releases ?? [],
		[searchIndexers.data],
	);

	// Release status is a separate query — independently cached & optimistically updatable
	const { data: statusMap } = useQuery({
		...bookReleaseStatusQuery(book.id),
		enabled: enabled && releases.length > 0,
	});

	// Auto-search when the tab first mounts (if indexers are available)
	useEffect(() => {
		if (!hasSearched.current && hasIndexers === true) {
			hasSearched.current = true;
			searchIndexers.mutate({
				query: defaultQuery,
				bookId: book.id,
				categories: null,
			});
		}
	}, [hasIndexers, searchIndexers.mutate, defaultQuery, book.id]);

	// Reset when disabled
	useEffect(() => {
		if (!enabled) {
			hasSearched.current = false;
		}
	}, [enabled]);

	const handleSearch = (query: string) => {
		searchIndexers.mutate({ query, bookId: book.id, categories: null });
	};

	const handleGrab = useCallback(
		(release: IndexerRelease) => {
			grabRelease.mutate(
				{
					guid: release.guid,
					indexerId: release.allstarrIndexerId,
					indexerSource: release.indexerSource,
					title: release.title,
					downloadUrl: release.downloadUrl,
					protocol: release.protocol,
					size: release.size,
					bookId: book.id,
					downloadClientId: null,
				},
				{
					onSuccess: (result) => {
						toast.success(`Sent to ${result.downloadClientName}`);
						queryClient.invalidateQueries({
							queryKey: queryKeys.indexers.releaseStatus(book.id),
						});
						queryClient.invalidateQueries({
							queryKey: queryKeys.queue.all,
						});
					},
				},
			);
		},
		[grabRelease, queryClient, book.id],
	);

	return (
		<TabsContent
			value="search"
			className="overflow-y-auto flex-1 min-h-0 space-y-4"
		>
			<SearchToolbar
				defaultQuery={defaultQuery}
				onSearch={handleSearch}
				searching={searchIndexers.isPending}
				disabled={hasIndexers === false}
			/>
			{hasIndexers === false ? (
				<div className="text-center py-8 text-muted-foreground">
					<p>No indexers configured or enabled.</p>
					<p className="text-sm mt-1">
						Add indexers in{" "}
						<Link
							to="/settings/indexers"
							className="underline hover:text-foreground"
							onClick={onNavigateAway}
						>
							Settings
						</Link>{" "}
						to search for releases.
					</p>
				</div>
			) : (
				(searchIndexers.data || searchIndexers.isPending) && (
					<ReleaseTable
						releases={releases}
						loading={searchIndexers.isPending}
						grabbingGuid={
							grabRelease.isPending ? grabRelease.variables?.guid : undefined
						}
						onGrab={handleGrab}
						statusMap={statusMap ?? null}
					/>
				)
			)}
		</TabsContent>
	);
}
