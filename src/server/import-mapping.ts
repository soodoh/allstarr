/** Extract the last path segment (like path.basename but without the node:path dependency). */
function basename(filePath: string): string {
	const i = filePath.lastIndexOf("/");
	const j = filePath.lastIndexOf("\\");
	return filePath.slice(Math.max(i, j) + 1);
}

type MappedTvFile = {
	path: string;
	season: number;
	episode: number;
};

type MappedBookFile = {
	path: string;
	extractedTitle: string;
};

const TV_EPISODE_PATTERN = /S(\d{1,2})E(\d{1,3})/i;
const BOOK_AUTHOR_TITLE = /^(.+?)\s*-\s*(.+?)(?:\.\w+)?$/;

export function mapTvFiles(filePaths: string[]): MappedTvFile[] {
	const results: MappedTvFile[] = [];
	for (const filePath of filePaths) {
		const name = basename(filePath);
		const match = name.match(TV_EPISODE_PATTERN);
		if (match) {
			results.push({
				path: filePath,
				season: Number.parseInt(match[1], 10),
				episode: Number.parseInt(match[2], 10),
			});
		}
	}
	return results;
}

export function mapBookFiles(filePaths: string[]): MappedBookFile[] {
	const results: MappedBookFile[] = [];
	for (const filePath of filePaths) {
		const name = basename(filePath);
		const nameNoExt = name.replace(/\.\w+$/, "");
		const authorTitleMatch = nameNoExt.match(BOOK_AUTHOR_TITLE);
		const extractedTitle = authorTitleMatch
			? authorTitleMatch[2].trim()
			: nameNoExt;
		results.push({ path: filePath, extractedTitle });
	}
	return results;
}
