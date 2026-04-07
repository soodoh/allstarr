import { Link } from "@tanstack/react-router";
import { BookOpen, Film, Search, Tv } from "lucide-react";
import type { ComponentType, JSX } from "react";
import { Card, CardContent } from "src/components/ui/card";
import type { QualityBreakdownItem, RecentActivityItem } from "src/lib/queries";

type ContentTypeConfig = {
	key: "books" | "shows" | "movies";
	title: string;
	icon: ComponentType<{ className?: string }>;
	accentColor: string;
	accentBg: string;
	gradientFrom: string;
	gradientTo: string;
	listPath: string;
	searchPath: string;
	statLabels: [string, string, string];
};

const CONTENT_CONFIGS: ContentTypeConfig[] = [
	{
		key: "books",
		title: "Books",
		icon: BookOpen,
		accentColor: "text-indigo-400",
		accentBg: "bg-indigo-500/15",
		gradientFrom: "from-indigo-400",
		gradientTo: "to-indigo-600",
		listPath: "/books",
		searchPath: "/books/add",
		statLabels: ["Total", "Monitored", "Authors"],
	},
	{
		key: "shows",
		title: "TV Shows",
		icon: Tv,
		accentColor: "text-purple-400",
		accentBg: "bg-purple-500/15",
		gradientFrom: "from-purple-400",
		gradientTo: "to-purple-600",
		listPath: "/tv",
		searchPath: "/tv/add",
		statLabels: ["Series", "Episodes", "On Disk"],
	},
	{
		key: "movies",
		title: "Movies",
		icon: Film,
		accentColor: "text-pink-400",
		accentBg: "bg-pink-500/15",
		gradientFrom: "from-pink-400",
		gradientTo: "to-pink-600",
		listPath: "/movies",
		searchPath: "/movies/add",
		statLabels: ["Total", "On Disk", "Collections"],
	},
];

const QUALITY_COLORS = [
	"bg-green-500",
	"bg-blue-500",
	"bg-yellow-500",
	"bg-red-500",
	"bg-orange-500",
	"bg-cyan-500",
];

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB", "PB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(i > 2 ? 1 : 0)} ${units[i]}`;
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

type ContentTypeCardProps = {
	config: ContentTypeConfig;
	stats: {
		total: number;
		monitored: number;
		fileCount: number;
		extra: { label: string; value: number };
	};
	qualityBreakdown: QualityBreakdownItem[];
	storageBytes: number;
	storageTotalBytes: number;
	recentItems: RecentActivityItem[];
};

function ContentTypeCardInner({
	config,
	stats,
	qualityBreakdown,
	storageBytes,
	storageTotalBytes,
	recentItems,
}: ContentTypeCardProps): JSX.Element {
	const isEmpty = stats.total === 0;
	const Icon = config.icon;

	const statValues =
		config.key === "books"
			? [stats.total, stats.monitored, stats.extra.value]
			: config.key === "shows"
				? [stats.total, stats.extra.value, stats.fileCount]
				: [stats.total, stats.fileCount, stats.extra.value];

	if (isEmpty) {
		return (
			<Card className="border-dashed opacity-50">
				<CardContent className="p-6">
					<div className="flex items-center gap-3">
						<div className={`rounded-lg p-2 ${config.accentBg}`}>
							<Icon className={`h-5 w-5 ${config.accentColor}`} />
						</div>
						<h3 className="text-lg font-semibold">{config.title}</h3>
					</div>
					<div className="mt-8 flex flex-col items-center text-center">
						<p className="text-sm text-muted-foreground">
							No {config.title.toLowerCase()} in your library yet.
							<br />
							Search for {config.title.toLowerCase()} to get started.
						</p>
						<Link
							to={config.searchPath}
							className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-accent"
						>
							<Search className="h-4 w-4" />
							Search {config.title} &rarr;
						</Link>
					</div>
				</CardContent>
			</Card>
		);
	}

	const totalQualityFiles = qualityBreakdown.reduce(
		(sum, q) => sum + q.count,
		0,
	);
	const storagePercent =
		storageTotalBytes > 0
			? Math.min((storageBytes / storageTotalBytes) * 100, 100)
			: 0;

	return (
		<Card>
			<CardContent className="p-6">
				{/* Header */}
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className={`rounded-lg p-2 ${config.accentBg}`}>
							<Icon className={`h-5 w-5 ${config.accentColor}`} />
						</div>
						<h3 className="text-lg font-semibold">{config.title}</h3>
					</div>
					<Link
						to={config.listPath}
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						View all &rarr;
					</Link>
				</div>

				{/* Counts Row */}
				<div className="mb-4 grid grid-cols-3 gap-3">
					{config.statLabels.map((label, i) => (
						<div key={label}>
							<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
								{label}
							</p>
							<p className="mt-0.5 text-xl font-semibold">{statValues[i]}</p>
						</div>
					))}
				</div>

				{/* Quality Breakdown */}
				{qualityBreakdown.length > 0 && (
					<div className="mb-3.5">
						<p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							Quality Breakdown
						</p>
						<div className="flex h-2 overflow-hidden rounded-full bg-muted">
							{qualityBreakdown.map((q, i) => (
								<div
									key={q.name}
									className={QUALITY_COLORS[i % QUALITY_COLORS.length]}
									style={{
										width: `${(q.count / totalQualityFiles) * 100}%`,
									}}
								/>
							))}
						</div>
						<div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
							{qualityBreakdown.map((q, i) => (
								<div
									key={q.name}
									className="flex items-center gap-1 text-[11px] text-muted-foreground"
								>
									<div
										className={`h-1.5 w-1.5 rounded-full ${QUALITY_COLORS[i % QUALITY_COLORS.length]}`}
									/>
									{q.name} ({Math.round((q.count / totalQualityFiles) * 100)}%)
								</div>
							))}
						</div>
					</div>
				)}

				{/* Storage Bar */}
				{storageBytes > 0 && (
					<div className="mb-3.5">
						<p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							Storage
						</p>
						<div className="flex items-center gap-3">
							<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
								<div
									className={`h-full rounded-full bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo}`}
									style={{ width: `${storagePercent}%` }}
								/>
							</div>
							<span className="shrink-0 text-xs text-muted-foreground">
								{formatBytes(storageBytes)}
								{storageTotalBytes > 0 &&
									` / ${formatBytes(storageTotalBytes)}`}
							</span>
						</div>
					</div>
				)}

				{/* Recent Items */}
				{recentItems.length > 0 && (
					<div>
						<p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							Recently Added
						</p>
						{recentItems.map((item) => (
							<div
								key={item.id}
								className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0"
							>
								<span className="truncate text-sm text-muted-foreground">
									{item.itemName ?? "Unknown"}
								</span>
								<span className="shrink-0 text-[11px] text-muted-foreground/60">
									{formatRelativeTime(item.date)}
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export { CONTENT_CONFIGS };
export default ContentTypeCardInner;
