import {
	AlertTriangle,
	CheckCircle2,
	Database,
	Pencil,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import EmptyState from "src/components/shared/empty-state";
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

type ImportSourcesListProps = {
	sources: ImportSourceRecord[];
	selectedSourceId: number | null;
	refreshingSourceId?: number | null;
	deletingSourceId?: number | null;
	onAddSource: () => void;
	onEditSource: (source: ImportSourceRecord) => void;
	onRefreshSource: (sourceId: number) => void;
	onSelectSource: (sourceId: number) => void;
	onDeleteSource: (sourceId: number) => void;
};

function formatSourceKind(kind: ImportSourceRecord["kind"]): string {
	return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function isSourceReady(source: ImportSourceRecord): boolean {
	return (
		source.hasApiKey &&
		!source.lastSyncError &&
		source.lastSyncStatus === "synced"
	);
}

function formatSyncStatus(source: ImportSourceRecord): JSX.Element {
	if (source.lastSyncError) {
		return (
			<Badge variant="destructive" className="gap-1">
				<AlertTriangle className="size-3" />
				Error
			</Badge>
		);
	}

	if (source.lastSyncStatus === "synced") {
		return (
			<Badge className="gap-1">
				<CheckCircle2 className="size-3" />
				Synced
			</Badge>
		);
	}

	return <Badge variant="outline">Idle</Badge>;
}

export default function ImportSourcesList({
	sources,
	selectedSourceId,
	refreshingSourceId = null,
	deletingSourceId = null,
	onAddSource,
	onDeleteSource,
	onEditSource,
	onRefreshSource,
	onSelectSource,
}: ImportSourcesListProps): JSX.Element {
	const [deleteSource, setDeleteSource] = useState<ImportSourceRecord | null>(
		null,
	);

	if (sources.length === 0) {
		return (
			<EmptyState
				icon={Database}
				title="No import sources"
				description="Connect a Servarr-compatible source to start building import plans and review groups."
				action={
					<Button onClick={onAddSource}>
						<Plus className="mr-2 size-4" />
						Add source
					</Button>
				}
			/>
		);
	}

	return (
		<>
			<div className="flex items-center justify-between gap-3">
				<div className="space-y-1">
					<div className="text-sm font-medium">
						{sources.length} source{sources.length === 1 ? "" : "s"}
					</div>
					<div className="text-sm text-muted-foreground">
						Select a source to inspect its mapped plan rows and review data.
					</div>
				</div>
				<Button onClick={onAddSource}>
					<Plus className="mr-2 size-4" />
					Add source
				</Button>
			</div>

			<div className="grid gap-3">
				{sources.map((source) => {
					const active = source.id === selectedSourceId;
					const refreshing = refreshingSourceId === source.id;
					const deleting = deletingSourceId === source.id;
					const ready = isSourceReady(source);

					return (
						<Card
							key={source.id}
							className={active ? "border-primary/60 bg-primary/5" : undefined}
						>
							<CardHeader className="pb-4">
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-2">
										<CardTitle className="flex items-center gap-2 text-base">
											<Database className="size-4 text-primary" />
											{source.label}
											{active ? (
												<Badge variant="outline">Selected</Badge>
											) : null}
										</CardTitle>
										<CardDescription>
											{formatSourceKind(source.kind)} • {source.baseUrl}
										</CardDescription>
									</div>
									<div className="flex flex-wrap justify-end gap-2">
										<Button
											variant={active ? "default" : "outline"}
											size="sm"
											disabled={!ready}
											onClick={() => onSelectSource(source.id)}
										>
											{ready ? (active ? "Selected" : "Select") : "Unavailable"}
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => onRefreshSource(source.id)}
											disabled={refreshing}
										>
											<RefreshCw
												className={
													refreshing
														? "mr-2 size-4 animate-spin"
														: "mr-2 size-4"
												}
											/>
											Refresh
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => onEditSource(source)}
										>
											<Pencil className="mr-2 size-4" />
											Edit
										</Button>
										<Button
											variant="destructive"
											size="sm"
											onClick={() => setDeleteSource(source)}
											disabled={deleting}
										>
											<Trash2 className="mr-2 size-4" />
											Delete
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent className="flex flex-wrap gap-2 text-sm">
								{formatSyncStatus(source)}
								<Badge variant="outline">
									API key {source.hasApiKey ? "configured" : "missing"}
								</Badge>
								<Badge variant="outline">
									Last sync {source.lastSyncStatus}
								</Badge>
								{source.lastSyncedAt ? (
									<Badge variant="outline">
										Synced {source.lastSyncedAt.toLocaleDateString()}
									</Badge>
								) : null}
								{source.lastSyncError ? (
									<div className="flex w-full items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
										<AlertTriangle className="mt-0.5 size-4 shrink-0" />
										<div className="min-w-0">
											<div className="font-medium">Sync error</div>
											<div className="text-sm">{source.lastSyncError}</div>
										</div>
									</div>
								) : null}
							</CardContent>
						</Card>
					);
				})}
			</div>

			<ConfirmDialog
				open={deleteSource !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteSource(null);
					}
				}}
				title="Delete Import Source"
				description={`Remove ${deleteSource?.label ?? "this source"} and its derived snapshots, plan rows, and review items.`}
				onConfirm={() => {
					if (!deleteSource) {
						return;
					}
					onDeleteSource(deleteSource.id);
					setDeleteSource(null);
				}}
				loading={deletingSourceId === deleteSource?.id}
			/>
		</>
	);
}
