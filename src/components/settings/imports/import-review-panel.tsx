import { AlertTriangle, CircleAlert, CircleCheck, Eye } from "lucide-react";
import type { JSX } from "react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import type { ImportSourceRecord } from "src/lib/queries";

type ImportReviewPanelProps = {
	sources: ImportSourceRecord[];
	selectedSourceId: number | null;
	onSelectSource: (sourceId: number) => void;
};

type ReviewRow = {
	recommendation: string;
	selectable: boolean;
	selected: boolean;
	source: ImportSourceRecord;
	statusLabel: string;
};

function getReviewRow(
	source: ImportSourceRecord,
	selected: boolean,
): ReviewRow {
	const ready =
		source.hasApiKey &&
		!source.lastSyncError &&
		source.lastSyncStatus === "synced";
	const recommendation = ready
		? "Review the latest snapshot and confirm the source is still aligned."
		: source.lastSyncError
			? "Fix the sync error before any review action."
			: !source.hasApiKey
				? "Add an API key before review."
				: source.lastSyncStatus !== "synced"
					? "Wait for a successful sync before review."
					: "Review data is unavailable.";

	return {
		recommendation,
		selectable: ready,
		selected,
		source,
		statusLabel: ready ? "Ready for review" : "Unresolved",
	};
}

export default function ImportReviewPanel({
	sources,
	selectedSourceId,
	onSelectSource,
}: ImportReviewPanelProps): JSX.Element {
	const rows = sources.map((source) =>
		getReviewRow(source, source.id === selectedSourceId),
	);
	const readyRows = rows.filter((row) => row.selectable);
	const blockedRows = rows.filter((row) => !row.selectable);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Review</CardTitle>
				<CardDescription>
					These are conservative review recommendations derived from the source
					cache. Unresolved rows stay disabled until Task 7 adds read-side data.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-2 text-sm">
					<Badge className="gap-1">
						<CircleCheck className="size-3" />
						Ready {readyRows.length}
					</Badge>
					<Badge variant="outline" className="gap-1">
						<CircleAlert className="size-3" />
						Needs attention {blockedRows.length}
					</Badge>
				</div>

				{rows.length === 0 ? (
					<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
						No sources are available to review yet.
					</div>
				) : (
					<div className="grid gap-3">
						{rows.map((row) => (
							<div
								key={row.source.id}
								className={`rounded-lg border p-4 ${row.selectable ? "bg-background" : "opacity-60"}`}
							>
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-2">
										<div className="flex items-center gap-2 text-sm font-medium">
											<Eye className="size-4 text-primary" />
											{row.source.label}
											{row.selected ? (
												<Badge variant="outline">Selected</Badge>
											) : null}
										</div>
										<div className="flex flex-wrap gap-2">
											<Badge variant={row.selectable ? "default" : "secondary"}>
												{row.statusLabel}
											</Badge>
											<Badge variant="outline">{row.source.kind}</Badge>
										</div>
									</div>
									<Button
										size="sm"
										variant={row.selected ? "default" : "outline"}
										disabled={!row.selectable}
										onClick={() => onSelectSource(row.source.id)}
									>
										{row.selectable
											? row.selected
												? "Current"
												: "Select"
											: "Unavailable"}
									</Button>
								</div>
								<div className="mt-3 flex items-start gap-2 rounded-md border border-border/70 bg-muted/30 p-3 text-sm">
									{row.selectable ? (
										<CircleCheck className="mt-0.5 size-4 text-primary" />
									) : (
										<AlertTriangle className="mt-0.5 size-4 text-destructive" />
									)}
									<div className="min-w-0">
										<div className="font-medium">
											{row.selectable
												? "Recommended follow-up"
												: "Review locked"}
										</div>
										<div className="text-muted-foreground">
											{row.recommendation}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
