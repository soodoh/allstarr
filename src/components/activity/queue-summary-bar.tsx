import type { JSX } from "react";
import { formatBytes } from "src/lib/format";
import type { CanonicalStatus } from "src/server/download-clients/types";
import type { QueueItem } from "src/server/queue";

type StatusFilter = CanonicalStatus | "all";

type QueueSummaryBarProps = {
	items: QueueItem[];
	filter: StatusFilter;
	onFilterChange: (filter: StatusFilter) => void;
	isConnected: boolean;
};

const FILTER_PILLS: Array<{ label: string; value: StatusFilter }> = [
	{ label: "All", value: "all" },
	{ label: "Downloading", value: "downloading" },
	{ label: "Queued", value: "queued" },
	{ label: "Paused", value: "paused" },
	{ label: "Failed", value: "failed" },
];

export default function QueueSummaryBar({
	items,
	filter,
	onFilterChange,
	isConnected,
}: QueueSummaryBarProps): JSX.Element {
	const activeCount = items.filter((i) => i.status === "downloading").length;
	const queuedCount = items.filter((i) => i.status === "queued").length;
	const totalDownloadSpeed = items.reduce((sum, i) => sum + i.downloadSpeed, 0);
	const totalUploadSpeed = items.reduce((sum, i) => sum + i.uploadSpeed, 0);
	const hasTorrent = items.some((i) => i.protocol === "torrent");

	function formatSpeed(bytesPerSec: number): string {
		if (bytesPerSec === 0) {
			return "—";
		}
		return `${formatBytes(bytesPerSec)}/s`;
	}

	return (
		<div className="rounded-lg border border-border bg-card p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
			{/* Left side: SSE indicator + stats */}
			<div className="flex items-center gap-4 flex-wrap">
				{/* SSE connection indicator */}
				<div className="flex items-center gap-2">
					<span
						className={
							isConnected
								? "h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
								: "h-2 w-2 rounded-full bg-amber-500 animate-pulse"
						}
					/>
					{!isConnected && (
						<span className="text-xs text-amber-500">Reconnecting...</span>
					)}
				</div>

				<div className="h-8 w-px bg-border" />

				{/* Active count */}
				<div className="flex flex-col">
					<span className="text-xs uppercase tracking-wider text-muted-foreground">
						Active
					</span>
					<span className="text-xl font-semibold">{activeCount}</span>
				</div>

				{/* Queued count */}
				<div className="flex flex-col">
					<span className="text-xs uppercase tracking-wider text-muted-foreground">
						Queued
					</span>
					<span className="text-xl font-semibold">{queuedCount}</span>
				</div>

				<div className="h-8 w-px bg-border" />

				{/* Download speed */}
				<div className="flex flex-col">
					<span className="text-xs uppercase tracking-wider text-muted-foreground">
						Download
					</span>
					<span className="text-xl font-semibold text-blue-500">
						{formatSpeed(totalDownloadSpeed)}
					</span>
				</div>

				{/* Upload speed — only shown when any item uses torrent protocol */}
				{hasTorrent && (
					<div className="flex flex-col">
						<span className="text-xs uppercase tracking-wider text-muted-foreground">
							Upload
						</span>
						<span className="text-xl font-semibold text-green-500">
							{formatSpeed(totalUploadSpeed)}
						</span>
					</div>
				)}
			</div>

			{/* Right side: filter pills */}
			<div className="flex items-center gap-1 flex-wrap">
				{FILTER_PILLS.map(({ label, value }) => (
					<button
						key={value}
						type="button"
						onClick={() => onFilterChange(value)}
						className={
							filter === value
								? "rounded-md px-2.5 py-1 text-xs bg-blue-500/20 text-blue-400"
								: "rounded-md px-2.5 py-1 text-xs bg-muted text-muted-foreground hover:text-foreground"
						}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
}
