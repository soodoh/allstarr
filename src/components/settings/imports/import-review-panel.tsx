import { AlertTriangle, CircleAlert, CircleCheck } from "lucide-react";
import type { JSX } from "react";
import { Badge } from "src/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";

export type ImportReviewRow = {
	action: string;
	payload: Record<string, unknown>;
	reason: string | null;
	resourceType: string;
	sourceKey: string;
	sourceSummary: string;
	status: "ready" | "blocked" | "unresolved";
	target: {
		id: number | null;
		label: string | null;
	};
	title: string;
};

type ImportReviewPanelProps = {
	rows: ImportReviewRow[];
};

export default function ImportReviewPanel({
	rows,
}: ImportReviewPanelProps): JSX.Element {
	const readyCount = rows.filter((row) => row.status === "ready").length;
	const blockedCount = rows.length - readyCount;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Review</CardTitle>
				<CardDescription>
					Inspect unresolved or blocked rows for the selected source.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-2 text-sm">
					<Badge className="gap-1">
						<CircleCheck className="size-3" />
						Ready {readyCount}
					</Badge>
					<Badge variant="outline" className="gap-1">
						<CircleAlert className="size-3" />
						Needs attention {blockedCount}
					</Badge>
				</div>

				{rows.length === 0 ? (
					<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
						No review rows are available for the selected source.
					</div>
				) : (
					<div className="grid gap-3">
						{rows.map((row) => (
							<div key={row.sourceKey} className="rounded-lg border p-4">
								<div className="flex items-center gap-2 text-sm font-medium">
									<AlertTriangle className="size-4 text-destructive" />
									{row.title}
								</div>
								<div className="mt-2 flex flex-wrap gap-2">
									<Badge variant="secondary">{row.resourceType}</Badge>
									<Badge variant="outline">{row.status}</Badge>
									{row.target.label ? (
										<Badge variant="outline">{row.target.label}</Badge>
									) : null}
								</div>
								<div className="mt-3 text-sm text-muted-foreground">
									<div>{row.sourceSummary}</div>
									{row.reason ? <div>{row.reason}</div> : null}
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
