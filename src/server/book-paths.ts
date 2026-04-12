import getMediaSetting from "./settings-reader";

type MediaType = "ebook" | "audio";

type BookFolderInput = {
	mediaType: MediaType;
	authorName: string;
	bookTitle: string;
	releaseYear: number | null | undefined;
};

type BookAuthorFolderInput = {
	mediaType: MediaType;
	authorName: string;
	bookTitle?: string;
	releaseYear?: number | null | undefined;
	authorFolderVarsMode?: "full" | "author-only";
};

function buildAuthorNamingVars({
	authorName,
	bookTitle,
	releaseYear,
	authorFolderVarsMode,
}: BookAuthorFolderInput): Record<string, string> {
	if (authorFolderVarsMode === "author-only") {
		return {
			"Author Name": authorName,
			"Book Title": "",
			"Release Year": "",
			"Book Series": "",
			"Book SeriesPosition": "",
			PartNumber: "",
			PartCount: "",
		};
	}
	return {
		"Author Name": authorName,
		"Book Title": bookTitle ?? "",
		"Release Year": releaseYear ? String(releaseYear) : "",
		"Book Series": "",
		"Book SeriesPosition": "",
		PartNumber: "",
		PartCount: "",
	};
}

function buildBookNamingVars({
	authorName,
	bookTitle,
	releaseYear,
}: Omit<BookFolderInput, "mediaType">): Record<string, string> {
	return {
		"Author Name": authorName,
		"Book Title": bookTitle,
		"Release Year": releaseYear ? String(releaseYear) : "",
		"Book Series": "",
		"Book SeriesPosition": "",
		PartNumber: "",
		PartCount: "",
	};
}

export function applyNamingTemplate(
	template: string,
	vars: Record<string, string>,
): string {
	let result = template.replaceAll(
		/\{([\w\s]+):(0+)\}/g,
		(_match, key: string, zeros: string) => {
			const value = vars[key.trim()] ?? "";
			return value ? value.padStart(zeros.length, "0") : "";
		},
	);
	for (const [key, value] of Object.entries(vars)) {
		result = result.replaceAll(`{${key}}`, value);
	}
	return result;
}

export function sanitizePath(name: string): string {
	return name.replaceAll(/[<>:"/\\|?*]/g, "_").trim();
}

export function buildBookAuthorFolderName({
	mediaType,
	authorName,
	bookTitle,
	releaseYear,
	authorFolderVarsMode,
}: BookAuthorFolderInput): string {
	return sanitizePath(
		applyNamingTemplate(
			getMediaSetting(`naming.book.${mediaType}.authorFolder`, "{Author Name}"),
			buildAuthorNamingVars({
				mediaType,
				authorName,
				bookTitle,
				releaseYear,
				authorFolderVarsMode,
			}),
		),
	);
}

export function buildBookFolderName({
	mediaType,
	authorName,
	bookTitle,
	releaseYear,
}: BookFolderInput): string {
	return sanitizePath(
		applyNamingTemplate(
			getMediaSetting(
				`naming.book.${mediaType}.bookFolder`,
				"{Book Title} ({Release Year})",
			),
			buildBookNamingVars({
				authorName,
				bookTitle,
				releaseYear,
			}),
		),
	);
}

export function buildBookFolderNames({
	mediaType,
	authorName,
	bookTitle,
	releaseYear,
}: BookFolderInput): {
	authorFolderName: string;
	bookFolderName: string;
} {
	return {
		authorFolderName: buildBookAuthorFolderName({
			mediaType,
			authorName,
			bookTitle,
			releaseYear,
		}),
		bookFolderName: buildBookFolderName({
			mediaType,
			authorName,
			bookTitle,
			releaseYear,
		}),
	};
}
