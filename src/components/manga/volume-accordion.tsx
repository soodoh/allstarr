import type { JSX } from "react";
import ChapterRow from "src/components/manga/chapter-row";
import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "src/components/ui/accordion";

type Chapter = {
	id: number;
	chapterNumber: string;
	title: string | null;
	releaseDate: string | null;
	scanlationGroup: string | null;
	hasFile: boolean | null;
	monitored: boolean | null;
};

type Volume = {
	id: number;
	volumeNumber: number | null;
	title: string | null;
	chapters: Chapter[];
};

type VolumeAccordionProps = {
	volume: Volume;
	displayTitle?: string;
	accordionValue?: string;
};

export default function VolumeAccordion({
	volume,
	displayTitle,
	accordionValue,
}: VolumeAccordionProps): JSX.Element {
	const sortedChapters = [...volume.chapters].toSorted((a, b) => {
		const aNum = Number.parseFloat(a.chapterNumber);
		const bNum = Number.parseFloat(b.chapterNumber);
		if (Number.isNaN(aNum) && Number.isNaN(bNum)) {
			return b.chapterNumber.localeCompare(a.chapterNumber);
		}
		if (Number.isNaN(aNum)) {
			return 1;
		}
		if (Number.isNaN(bNum)) {
			return -1;
		}
		return bNum - aNum;
	});

	const fileCount = sortedChapters.filter((ch) => ch.hasFile).length;
	const totalCount = sortedChapters.length;
	const volumeLabel =
		displayTitle ??
		(volume.volumeNumber === null
			? "Ungrouped"
			: `Volume ${volume.volumeNumber}`);

	// Color the progress based on completeness
	let progressColor = "text-muted-foreground";
	if (totalCount > 0) {
		if (fileCount === totalCount) {
			progressColor = "text-green-500";
		} else if (fileCount > 0) {
			progressColor = "text-yellow-500";
		}
	}

	return (
		<AccordionItem value={accordionValue ?? `volume-${volume.id}`}>
			<AccordionTrigger className="hover:no-underline px-3">
				<div className="flex flex-1 items-center gap-4">
					<span className="font-medium">{volumeLabel}</span>
					<span className="text-muted-foreground text-xs">
						{totalCount} chapter{totalCount === 1 ? "" : "s"}
					</span>
					<span className={`text-xs font-mono ${progressColor}`}>
						{fileCount}/{totalCount}
					</span>
				</div>
			</AccordionTrigger>
			<AccordionContent className="px-0 pb-0">
				{/* Column headers */}
				<div className="flex items-center gap-4 px-3 py-1.5 text-xs text-muted-foreground border-b font-medium">
					<span className="w-20 shrink-0">#</span>
					<span className="flex-1 min-w-0">Title</span>
					<span className="w-28 shrink-0 text-right">Release Date</span>
					<span className="w-28 shrink-0 text-right">Group</span>
					<span className="w-8 shrink-0 text-center">File</span>
				</div>
				{sortedChapters.map((chapter) => (
					<ChapterRow key={chapter.id} chapter={chapter} />
				))}
			</AccordionContent>
		</AccordionItem>
	);
}
