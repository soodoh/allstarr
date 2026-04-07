import { db } from "src/db";
import { downloadProfiles } from "src/db/schema";

export function getRootFolderPaths(): string[] {
	const rows = db
		.select({ rootFolderPath: downloadProfiles.rootFolderPath })
		.from(downloadProfiles)
		.all();
	return [...new Set(rows.map((row) => row.rootFolderPath).filter(Boolean))];
}
