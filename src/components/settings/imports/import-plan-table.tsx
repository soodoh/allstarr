import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Checkbox from "src/components/ui/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import { useApplyImportPlan } from "src/hooks/mutations/imports";

export type ImportPlanRow = {
	action: string;
	payload: Record<string, unknown>;
	reason: string | null;
	resourceType: string;
	selectable: boolean;
	sourceKey: string;
	sourceSummary: string;
	target: {
		id: number | null;
		label: string | null;
	};
	title: string;
};

type ImportPlanTableProps = {
	rows: ImportPlanRow[];
	sourceId: number | null;
};

function getSelectableKeys(rows: ImportPlanRow[]): string[] {
	return rows.filter((row) => row.selectable).map((row) => row.sourceKey);
}

function formatAction(action: string): string {
	return action.charAt(0).toUpperCase() + action.slice(1);
}

export default function ImportPlanTable({
	rows,
	sourceId,
}: ImportPlanTableProps): JSX.Element {
	const applyMutation = useApplyImportPlan();
	const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

	useEffect(() => {
		setSelectedKeys(getSelectableKeys(rows));
	}, [rows]);

	const selectedRows = rows.filter((row) =>
		selectedKeys.includes(row.sourceKey),
	);
	const readyCount = rows.filter((row) => row.selectable).length;
	const blockedCount = rows.length - readyCount;

	function toggleRow(sourceKey: string, checked: boolean) {
		setSelectedKeys((current) => {
			if (checked) {
				if (current.includes(sourceKey)) {
					return current;
				}
				return [...current, sourceKey];
			}
			return current.filter((key) => key !== sourceKey);
		});
	}

	function handleApply() {
		if (sourceId === null || selectedRows.length === 0) {
			return;
		}

		applyMutation.mutate({
			selectedRows: selectedRows.map((row) => ({
				action: row.action,
				payload: row.payload,
				resourceType: row.resourceType,
				sourceKey: row.sourceKey,
			})),
			sourceId,
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Plan</CardTitle>
				<CardDescription>
					Review mapped rows for the selected source and apply the ones that are
					ready.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<Badge>Ready {readyCount}</Badge>
					<Badge variant="outline">Needs attention {blockedCount}</Badge>
					<div className="ml-auto">
						<Button
							disabled={
								sourceId === null ||
								selectedRows.length === 0 ||
								applyMutation.isPending
							}
							onClick={handleApply}
						>
							{applyMutation.isPending ? "Applying..." : "Apply Selected"}
						</Button>
					</div>
				</div>

				{rows.length === 0 ? (
					<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
						No rows are available for the selected source yet.
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">Pick</TableHead>
								<TableHead>Source Item</TableHead>
								<TableHead>Target</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Summary</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const checked = selectedKeys.includes(row.sourceKey);
								return (
									<TableRow
										key={row.sourceKey}
										className={row.selectable ? undefined : "opacity-60"}
									>
										<TableCell>
											<Checkbox
												aria-label={`Select ${row.title}`}
												checked={checked}
												disabled={!row.selectable}
												onCheckedChange={(value) =>
													toggleRow(row.sourceKey, value === true)
												}
											/>
										</TableCell>
										<TableCell className="font-medium">{row.title}</TableCell>
										<TableCell>
											{row.target.label ?? (
												<span className="text-muted-foreground">No target</span>
											)}
										</TableCell>
										<TableCell>{row.resourceType}</TableCell>
										<TableCell>
											<Badge variant={row.selectable ? "default" : "secondary"}>
												{formatAction(row.action)}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											<div>{row.sourceSummary}</div>
											{row.reason ? <div>{row.reason}</div> : null}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
