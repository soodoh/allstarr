import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { useState } from "react";
import TablePagination from "src/components/shared/table-pagination";
import { Badge } from "src/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import { TabsContent } from "src/components/ui/tabs";
import { formatBytes } from "src/lib/format";
import type { HistoryResult } from "src/lib/queries";
import { historyListQuery } from "src/lib/queries";

const eventTypeLabels: Record<string, string> = {
	bookAdded: "Book Added",
	bookUpdated: "Book Updated",
	bookDeleted: "Book Deleted",
	bookGrabbed: "Grabbed",
	bookFileAdded: "File Added",
	bookFileRemoved: "File Removed",
};

const eventTypeVariants: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	bookAdded: "default",
	bookUpdated: "secondary",
	bookDeleted: "destructive",
	bookGrabbed: "outline",
	bookFileAdded: "default",
	bookFileRemoved: "destructive",
};

type BookHistoryTabProps = {
	bookId: number;
};

export default function BookHistoryTab({
	bookId,
}: BookHistoryTabProps): JSX.Element {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);

	const { data, isLoading } = useQuery(
		historyListQuery({ bookId, page, limit: pageSize }),
	);
	const typedData = data as unknown as HistoryResult | undefined;

	const handlePageSizeChange = (size: number) => {
		setPageSize(size);
		setPage(1);
	};

	if (isLoading) {
		return (
			<TabsContent value="history" className="flex-1 min-h-0">
				<div className="text-center py-12 text-muted-foreground">
					Loading history...
				</div>
			</TabsContent>
		);
	}

	if (!typedData || typedData.items.length === 0) {
		return (
			<TabsContent value="history" className="flex-1 min-h-0">
				<div className="text-center py-12 text-muted-foreground">
					No history events found for this book.
				</div>
			</TabsContent>
		);
	}

	return (
		<TabsContent value="history" className="flex-1 min-h-0">
			<div className="space-y-4">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Date</TableHead>
							<TableHead>Event</TableHead>
							<TableHead>Details</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{typedData.items.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="text-sm whitespace-nowrap">
									{new Date(item.date).toLocaleString()}
								</TableCell>
								<TableCell>
									<Badge
										variant={eventTypeVariants[item.eventType] || "secondary"}
									>
										{eventTypeLabels[item.eventType] || item.eventType}
									</Badge>
								</TableCell>
								<TableCell className="text-xs text-muted-foreground max-w-xs truncate">
									{renderDetails(item.eventType, item.data)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>

				<TablePagination
					page={page}
					pageSize={pageSize}
					totalItems={typedData.total}
					totalPages={typedData.totalPages}
					onPageChange={setPage}
					onPageSizeChange={handlePageSizeChange}
				/>
			</div>
		</TabsContent>
	);
}

function renderDetails(
	eventType: string,
	data: Record<string, string | number | boolean | null> | null,
): string {
	if (!data) {
		return "-";
	}

	if (eventType === "bookGrabbed") {
		const parts: string[] = [];
		if (data.downloadClientName) {
			parts.push(`Client: ${data.downloadClientName}`);
		}
		if (data.protocol) {
			parts.push(`Protocol: ${data.protocol}`);
		}
		if (typeof data.size === "number") {
			parts.push(formatBytes(data.size));
		}
		return parts.length > 0 ? parts.join(" · ") : "-";
	}

	return Object.entries(data)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");
}
