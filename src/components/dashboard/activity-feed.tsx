import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "src/components/ui/card";
import { formatRelativeTime } from "src/lib/format";
import { dashboardRecentActivityQuery } from "src/lib/queries";

const EVENT_TYPE_STYLES: Record<string, { color: string; label: string }> = {
	bookAdded: { color: "bg-green-500", label: "added" },
	authorAdded: { color: "bg-green-500", label: "added" },
	movieAdded: { color: "bg-green-500", label: "added" },
	showAdded: { color: "bg-green-500", label: "added" },
	episodeAdded: { color: "bg-green-500", label: "added" },
	bookFileImported: { color: "bg-blue-500", label: "imported" },
	episodeFileImported: { color: "bg-blue-500", label: "imported" },
	movieFileImported: { color: "bg-blue-500", label: "imported" },
	grabbed: { color: "bg-blue-500", label: "grabbed" },
	downloadImported: { color: "bg-blue-500", label: "downloaded" },
	bookUpdated: { color: "bg-yellow-500", label: "updated" },
	movieUpdated: { color: "bg-yellow-500", label: "updated" },
	bookDeleted: { color: "bg-red-500", label: "deleted" },
	movieDeleted: { color: "bg-red-500", label: "deleted" },
};

export default function ActivityFeed() {
	const { data: activity } = useSuspenseQuery(dashboardRecentActivityQuery());

	if (activity.length === 0) {
		return null;
	}

	return (
		<div>
			<h2 className="mb-4 text-base font-semibold text-muted-foreground">
				Recent Activity
			</h2>
			<Card>
				<CardContent className="p-5">
					{activity.map((item, i) => {
						const style = EVENT_TYPE_STYLES[item.eventType] ?? {
							color: "bg-muted-foreground",
							label: item.eventType,
						};
						return (
							<div
								key={item.id}
								className={`flex items-start gap-3 py-2.5 ${
									i < activity.length - 1 ? "border-b border-border/50" : ""
								}`}
							>
								<div
									className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.color}`}
								/>
								<div className="min-w-0 flex-1">
									<p className="text-sm">
										<span className="font-medium">
											{item.itemName ?? "Unknown item"}
										</span>{" "}
										<span className="text-muted-foreground">
											was {style.label}
										</span>
									</p>
									<p className="text-[11px] text-muted-foreground/60">
										{formatRelativeTime(item.date)} &middot; {item.contentType}
									</p>
								</div>
							</div>
						);
					})}
					<div className="pt-3 text-center">
						<Link
							to="/activity/history"
							className="text-sm text-muted-foreground hover:text-foreground"
						>
							View all activity &rarr;
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
