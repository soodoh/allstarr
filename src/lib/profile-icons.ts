import type { LucideIcon } from "lucide-react";
import {
	AudioLines,
	BookMarked,
	BookOpen,
	BookText,
	Clapperboard,
	Disc,
	FileText,
	FileType,
	Film,
	Hd,
	Headphones,
	Library,
	Mic,
	MonitorPlay,
	Music,
	NotebookPen,
	ScrollText,
	Tv,
	Video,
} from "lucide-react";

/** DB value -> display label */
export const PROFILE_ICONS: Record<string, string> = {
	"book-open": "Book (Open)",
	"book-text": "Book (Text)",
	"book-marked": "Book (Marked)",
	library: "Library",
	"file-text": "Document",
	"file-type": "File Type",
	"notebook-pen": "Notebook",
	headphones: "Headphones",
	"audio-lines": "Audio Waves",
	music: "Music",
	mic: "Microphone",
	tv: "TV",
	"monitor-play": "Monitor",
	film: "Film",
	clapperboard: "Clapperboard",
	video: "Video",
	disc: "Disc",
	"scroll-text": "Scroll",
	hd: "HD",
};

/** DB value -> lucide-react component */
export const PROFILE_ICON_MAP: Record<string, LucideIcon> = {
	"book-open": BookOpen,
	"book-text": BookText,
	"book-marked": BookMarked,
	library: Library,
	"file-text": FileText,
	"file-type": FileType,
	"notebook-pen": NotebookPen,
	headphones: Headphones,
	"audio-lines": AudioLines,
	music: Music,
	mic: Mic,
	tv: Tv,
	"monitor-play": MonitorPlay,
	film: Film,
	clapperboard: Clapperboard,
	video: Video,
	disc: Disc,
	"scroll-text": ScrollText,
	hd: Hd,
};

/** Returns the Lucide component for a profile icon key, defaulting to BookOpen. */
export function getProfileIcon(icon: string | null): LucideIcon {
	if (icon && icon in PROFILE_ICON_MAP) {
		return PROFILE_ICON_MAP[icon];
	}
	return BookOpen;
}
