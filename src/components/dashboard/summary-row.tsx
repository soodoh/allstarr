import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "src/components/ui/card";
import { formatBytes } from "src/lib/format";
import {
	dashboardContentStatsQuery,
	dashboardStorageQuery,
} from "src/lib/queries";
import { systemStatusQuery } from "src/lib/queries/system-status";

export default function SummaryRow() {
	const { data: contentStats } = useSuspenseQuery(dashboardContentStatsQuery());
	const { data: storage } = useSuspenseQuery(dashboardStorageQuery());
	const { data: systemStatus } = useSuspenseQuery(systemStatusQuery());

	const totalItems =
		contentStats.books.total +
		contentStats.shows.total +
		contentStats.movies.total;
	const totalFiles =
		contentStats.books.fileCount +
		contentStats.shows.fileCount +
		contentStats.movies.fileCount;

	const healthIssueCount = systemStatus.health.length;
	const hasIssues = healthIssueCount > 0;

	return (
		<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
			<Card>
				<CardContent className="p-5">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Total Items
					</p>
					<p className="mt-2 text-3xl font-bold">{totalItems}</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{contentStats.books.total} books &middot; {contentStats.shows.total}{" "}
						shows &middot; {contentStats.movies.total} movies
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-5">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Files on Disk
					</p>
					<p className="mt-2 text-3xl font-bold">{totalFiles}</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{contentStats.books.fileCount} ebooks &middot;{" "}
						{contentStats.shows.fileCount} episodes &middot;{" "}
						{contentStats.movies.fileCount} movies
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-5">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Disk Usage
					</p>
					<p className="mt-2 text-3xl font-bold">
						{formatBytes(storage.totalUsed)}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{storage.totalCapacity > 0
							? `of ${formatBytes(storage.totalCapacity)} across ${storage.rootFolderCount} root ${storage.rootFolderCount === 1 ? "folder" : "folders"}`
							: "No root folders configured"}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-5">
					<Link to="/system/status" className="block">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							System Health
						</p>
						<div className="mt-2 flex items-center gap-2">
							<div
								className={`h-2.5 w-2.5 rounded-full ${
									hasIssues
										? "bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.4)]"
										: "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
								}`}
							/>
							<span className="text-sm font-medium">
								{hasIssues
									? `${healthIssueCount} ${healthIssueCount === 1 ? "issue" : "issues"} detected`
									: "All systems healthy"}
							</span>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							View details &rarr;
						</p>
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
