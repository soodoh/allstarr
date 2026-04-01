import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ContentType } from "src/components/activity/content-type-filter";
import ContentTypeFilter from "src/components/activity/content-type-filter";
import QueueConnectionBanner from "src/components/activity/queue-connection-banner";
import QueueItemRow from "src/components/activity/queue-item-row";
import QueueSummaryBar from "src/components/activity/queue-summary-bar";
import RemoveDownloadDialog from "src/components/activity/remove-download-dialog";
import EmptyState from "src/components/shared/empty-state";
import { queueListQuery } from "src/lib/queries";
import { queryKeys } from "src/lib/query-keys";
import type { CanonicalStatus } from "src/server/download-clients/types";
import type { QueueItem } from "src/server/queue";
import {
	pauseDownloadFn,
	resumeDownloadFn,
	setDownloadPriorityFn,
} from "src/server/queue";

type StatusFilter = CanonicalStatus | "all";

function matchesContentType(item: QueueItem, contentType: ContentType) {
	if (contentType === "all") {
		return true;
	}
	if (contentType === "books") {
		return item.bookId !== null;
	}
	if (contentType === "tv") {
		return item.showId !== null || item.episodeId !== null;
	}
	if (contentType === "movies") {
		return item.movieId !== null;
	}
	return true;
}

export default function QueueTab({
	isConnected,
}: {
	isConnected: boolean;
}): JSX.Element {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery({
		...queueListQuery(),
		// Fallback polling when SSE is disconnected
		refetchInterval: isConnected ? false : 15_000,
	});
	const [contentType, setContentType] = useState<ContentType>("all");
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [removeItem, setRemoveItem] = useState<QueueItem | null>(null);
	const items = useMemo(() => data?.items ?? [], [data?.items]);
	const warnings = useMemo(() => data?.warnings ?? [], [data?.warnings]);
	const contentTypeItems = useMemo(
		() => items.filter((i) => matchesContentType(i, contentType)),
		[items, contentType],
	);
	const filteredItems = useMemo(
		() =>
			filter === "all"
				? contentTypeItems
				: contentTypeItems.filter((i) => i.status === filter),
		[contentTypeItems, filter],
	);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (items.length === 0 && warnings.length === 0) {
		return (
			<EmptyState
				icon={Download}
				title="No active downloads"
				description="Downloads from your configured clients will appear here."
			/>
		);
	}

	// Optimistic update helper
	function optimisticStatusUpdate(item: QueueItem, newStatus: CanonicalStatus) {
		queryClient.setQueryData(
			queryKeys.queue.list(),
			(old: { items: QueueItem[]; warnings: string[] } | undefined) => {
				if (!old) {
					return old;
				}
				return {
					...old,
					items: old.items.map((i) =>
						i.id === item.id && i.downloadClientId === item.downloadClientId
							? { ...i, status: newStatus }
							: i,
					),
				};
			},
		);
	}

	async function handlePause(item: QueueItem) {
		optimisticStatusUpdate(item, "paused");
		try {
			await pauseDownloadFn({
				data: {
					downloadClientId: item.downloadClientId,
					downloadItemId: item.id,
				},
			});
		} catch (error) {
			toast.error(
				`Failed to pause: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	async function handleResume(item: QueueItem) {
		optimisticStatusUpdate(item, "downloading");
		try {
			await resumeDownloadFn({
				data: {
					downloadClientId: item.downloadClientId,
					downloadItemId: item.id,
				},
			});
		} catch (error) {
			toast.error(
				`Failed to resume: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	async function handlePriority(item: QueueItem, direction: number) {
		try {
			await setDownloadPriorityFn({
				data: {
					downloadClientId: item.downloadClientId,
					downloadItemId: item.id,
					priority: direction,
				},
			});
		} catch (error) {
			toast.error(
				`Failed to change priority: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	return (
		<>
			<div className="mb-4">
				<ContentTypeFilter value={contentType} onChange={setContentType} />
			</div>
			<QueueSummaryBar
				items={contentTypeItems}
				filter={filter}
				onFilterChange={setFilter}
				isConnected={isConnected}
			/>
			<QueueConnectionBanner warnings={warnings} />
			<div className="rounded-lg border border-border overflow-hidden">
				{filteredItems.map((item) => (
					<QueueItemRow
						key={`${item.downloadClientId}-${item.id}`}
						item={item}
						onPause={handlePause}
						onResume={handleResume}
						onRemove={setRemoveItem}
						onPriorityUp={(i) => handlePriority(i, 1)}
						onPriorityDown={(i) => handlePriority(i, -1)}
					/>
				))}
				{filteredItems.length === 0 && items.length > 0 && (
					<div className="px-4 py-8 text-center text-sm text-muted-foreground">
						No {filter} downloads
					</div>
				)}
			</div>
			<RemoveDownloadDialog
				item={removeItem}
				onOpenChange={(open) => {
					if (!open) {
						setRemoveItem(null);
					}
				}}
			/>
		</>
	);
}
