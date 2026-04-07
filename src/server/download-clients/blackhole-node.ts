import fs from "node:fs";
import path from "node:path";

export function assertWritableFolder(folder: string): void {
	fs.accessSync(folder, fs.constants.W_OK);
}

export function writeDownloadFile(
	folder: string,
	filename: string,
	data: string | Uint8Array,
	encoding?: BufferEncoding,
): string {
	const filePath = path.join(folder, filename);
	if (typeof data === "string" && encoding) {
		fs.writeFileSync(filePath, data, encoding);
	} else {
		fs.writeFileSync(filePath, data);
	}
	return filePath;
}

export function removeDownloadFile(folder: string, id: string): void {
	const filePath = path.join(folder, id);
	try {
		fs.unlinkSync(filePath);
	} catch {
		// File may have already been picked up by the download client.
	}
}

export function listDownloadFiles(folder: string): Array<{
	id: string;
	name: string;
	size: number;
}> {
	try {
		return fs
			.readdirSync(folder)
			.filter((file) => file.endsWith(".torrent") || file.endsWith(".nzb"))
			.map((file) => {
				const filePath = path.join(folder, file);
				const stat = fs.statSync(filePath);
				return {
					id: file,
					name: file,
					size: stat.size,
				};
			});
	} catch {
		return [];
	}
}
