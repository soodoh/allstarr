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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import type { ImportSourceRecord } from "src/lib/queries";

type ImportPlanTableProps = {
	sources: ImportSourceRecord[];
	selectedSourceId: number | null;
	onSelectSource: (sourceId: number) => void;
};

type PlanRow = {
	reason: string;
	source: ImportSourceRecord;
	selectable: boolean;
	selected: boolean;
	statusLabel: string;
};

function getPlanRow(source: ImportSourceRecord, selected: boolean): PlanRow {
	const ready =
		source.hasApiKey &&
		!source.lastSyncError &&
		source.lastSyncStatus === "synced";
	const reason = ready
		? "Ready to advance"
		: source.lastSyncError
			? "Resolve the sync error before planning"
			: !source.hasApiKey
				? "Add an API key before planning"
				: source.lastSyncStatus !== "synced"
					? "Wait for a successful snapshot sync"
					: "Plan data is unavailable";

	return {
		reason,
		selectable: ready,
		selected,
		source,
		statusLabel: ready ? "Ready" : "Unavailable",
	};
}

export default function ImportPlanTable({
	sources,
	selectedSourceId,
	onSelectSource,
}: ImportPlanTableProps): JSX.Element {
	const rows = sources.map((source) =>
		getPlanRow(source, source.id === selectedSourceId),
	);
	const readyCount = rows.filter((row) => row.selectable).length;
	const blockedCount = rows.length - readyCount;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Plan</CardTitle>
				<CardDescription>
					These are placeholder plan groups derived from the source cache. Rows
					that still need attention are disabled until the source is ready.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-2 text-sm">
					<Badge>Ready {readyCount}</Badge>
					<Badge variant="outline">Needs attention {blockedCount}</Badge>
				</div>

				{rows.length === 0 ? (
					<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
						No sources are available to build a plan yet.
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Source</TableHead>
								<TableHead>Kind</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Reason</TableHead>
								<TableHead className="w-32">Action</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow
									key={row.source.id}
									className={row.selectable ? undefined : "opacity-60"}
								>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2">
											{row.source.label}
											{row.selected ? (
												<Badge variant="outline">Selected</Badge>
											) : null}
										</div>
									</TableCell>
									<TableCell>{row.source.kind}</TableCell>
									<TableCell>
										<Badge variant={row.selectable ? "default" : "secondary"}>
											{row.statusLabel}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{row.reason}
									</TableCell>
									<TableCell>
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
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
