import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	BookTableRow,
	ColumnKey,
} from "src/components/bookshelf/books/base-book-table";
import BaseBookTable from "src/components/bookshelf/books/base-book-table";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import { useTableColumns } from "src/hooks/use-table-columns";
import { matchesProfileFormat } from "src/lib/editions";
import { bookEditionsInfiniteQuery } from "src/lib/queries/books";

type EditionSelectionModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bookId: number;
	bookCoverUrl: string | null;
	profile: { id: number; name: string; contentType: "ebook" | "audiobook" };
	currentEditionId?: number;
	onConfirm: (editionId: number) => void;
	isPending: boolean;
};

export default function EditionSelectionModal({
	open,
	onOpenChange,
	bookId,
	bookCoverUrl,
	profile,
	currentEditionId,
	onConfirm,
	isPending,
}: EditionSelectionModalProps): JSX.Element {
	const [selectedEditionId, setSelectedEditionId] = useState<
		number | undefined
	>(currentEditionId);
	const [formatFilterOn, setFormatFilterOn] = useState(true);
	const [sortKey, setSortKey] = useState<string>("readers");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	const sentinelRef = useRef<HTMLDivElement>(null);

	const { visibleColumns } = useTableColumns("book-editions");
	const columns = useMemo(
		() =>
			visibleColumns.map((col) => ({
				key: col.key as ColumnKey,
				sortable: true,
			})),
		[visibleColumns],
	);

	// Reset selectedEditionId when currentEditionId changes (modal opens with different profile)
	useEffect(() => {
		setSelectedEditionId(currentEditionId);
	}, [currentEditionId]);

	const handleSort = (key: string) => {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	};

	const { data, isFetchingNextPage, hasNextPage, fetchNextPage, isLoading } =
		useInfiniteQuery({
			...bookEditionsInfiniteQuery(bookId, sortKey, sortDir),
			enabled: open,
		});

	const allItems = useMemo(
		() => data?.pages.flatMap((p) => p.items) ?? [],
		[data],
	);

	const rows: BookTableRow[] = useMemo(() => {
		const items = formatFilterOn
			? allItems.filter((item) =>
					matchesProfileFormat(
						item.format,
						profile.contentType === "audiobook" ? "audio" : "ebook",
					),
				)
			: allItems;

		return items.map((item) => ({
			key: item.id,
			bookId: item.bookId,
			title: item.title,
			coverUrl: item.images?.[0]?.url ?? bookCoverUrl,
			bookAuthors: [],
			authorName: null,
			releaseDate: item.releaseDate,
			usersCount: item.usersCount,
			rating: null,
			ratingsCount: null,
			format: item.format,
			pageCount: item.pageCount,
			audioLength: item.audioLength,
			isbn10: item.isbn10,
			isbn13: item.isbn13,
			asin: item.asin,
			score: item.score,
			publisher: item.publisher,
			editionInformation: item.editionInformation,
			language: item.language,
			country: item.country,
			series: [],
			monitored: item.downloadProfileIds.length > 0,
			downloadProfileIds: item.downloadProfileIds,
		}));
	}, [allItems, formatFilterOn, profile.contentType, bookCoverUrl]);

	// Infinite scroll observer
	const handleObserver = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
				fetchNextPage();
			}
		},
		[hasNextPage, isFetchingNextPage, fetchNextPage],
	);

	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) {
			return;
		}
		const observer = new IntersectionObserver(handleObserver, {
			rootMargin: "200px",
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [handleObserver]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[100vw] sm:max-w-[calc(100vw-4rem)] max-h-[100vh] sm:max-h-[80vh]">
				<DialogHeader>
					<DialogTitle>Select Edition for {profile.name}</DialogTitle>
				</DialogHeader>

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Switch
							id="format-filter"
							checked={formatFilterOn}
							onCheckedChange={setFormatFilterOn}
							size="sm"
						/>
						<Label htmlFor="format-filter" className="text-sm cursor-pointer">
							Show matching formats only
						</Label>
					</div>
					<ColumnSettingsPopover tableId="book-editions" />
				</div>

				<div className="flex-1 min-h-0 overflow-auto">
					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : (
						<>
							<BaseBookTable
								rows={rows}
								columns={columns}
								sortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								selectedRowKey={selectedEditionId}
								onRowClick={(row) => setSelectedEditionId(row.key as number)}
								emptyMessage="No editions found."
							/>
							<div ref={sentinelRef} className="h-1" />
							{isFetchingNextPage && (
								<div className="flex items-center justify-center py-4">
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								</div>
							)}
						</>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={selectedEditionId === undefined || isPending}
						onClick={() => {
							if (selectedEditionId !== undefined) {
								onConfirm(selectedEditionId);
							}
						}}
					>
						{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
