import { Check, Minus } from "lucide-react";
import type { JSX } from "react";

type Chapter = {
	id: number;
	chapterNumber: string;
	title: string | null;
	releaseDate: string | null;
	scanlationGroup: string | null;
	hasFile: boolean | null;
	monitored: boolean | null;
};

type ChapterRowProps = {
	chapter: Chapter;
};

function formatReleaseDate(releaseDate: string | null): string {
	if (!releaseDate) {
		return "TBA";
	}
	try {
		return new Date(`${releaseDate}T00:00:00`).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return releaseDate;
	}
}

export default function ChapterRow({ chapter }: ChapterRowProps): JSX.Element {
	return (
		<div className="flex items-center gap-4 px-3 py-2 text-sm border-b last:border-b-0">
			{/* Chapter number */}
			<span className="w-20 shrink-0 font-mono text-muted-foreground">
				{chapter.chapterNumber}
			</span>

			{/* Title */}
			<span
				className="flex-1 min-w-0 truncate"
				title={chapter.title ?? undefined}
			>
				{chapter.title || "-"}
			</span>

			{/* Release date */}
			<span className="w-28 shrink-0 text-right">
				{formatReleaseDate(chapter.releaseDate)}
			</span>

			{/* Scanlation group */}
			<span
				className="w-28 shrink-0 text-right text-muted-foreground truncate"
				title={chapter.scanlationGroup ?? undefined}
			>
				{chapter.scanlationGroup || "-"}
			</span>

			{/* File status */}
			<span className="w-8 shrink-0 flex justify-center">
				{chapter.hasFile ? (
					<Check className="h-4 w-4 text-green-500" />
				) : (
					<Minus className="h-4 w-4 text-muted-foreground" />
				)}
			</span>
		</div>
	);
}
