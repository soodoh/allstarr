import * as fs from "node:fs";
import { db } from "src/db";
import { downloadClients, indexers, syncedIndexers } from "src/db/schema";
import { getRootFolderPaths } from "src/server/disk-scan";
import type { TaskResult } from "../registry";
import { registerTask } from "../registry";

function runHealthChecks(): number {
	let issues = 0;

	const folderPaths = getRootFolderPaths();
	if (folderPaths.length === 0) {
		issues += 1;
	} else {
		for (const folderPath of folderPaths) {
			try {
				fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
			} catch {
				issues += 1;
			}
		}
	}

	const allIndexers = db.select().from(indexers).all();
	const allSyncedIndexers = db.select().from(syncedIndexers).all();
	if (allIndexers.length === 0 && allSyncedIndexers.length === 0) {
		issues += 1;
	}

	const allClients = db.select().from(downloadClients).all();
	if (allClients.length === 0) {
		issues += 1;
	}

	if (!process.env.HARDCOVER_TOKEN) {
		issues += 1;
	}

	return issues;
}

registerTask({
	id: "check-health",
	name: "Check Health",
	description:
		"Verify system health including root folders, indexers, and download clients.",
	defaultInterval: 25 * 60, // 25 minutes
	group: "maintenance",
	handler: async (_updateProgress): Promise<TaskResult> => {
		const issues = runHealthChecks();
		return {
			success: true,
			message:
				issues === 0
					? "All systems healthy"
					: `Found ${issues} health issue(s)`,
		};
	},
});
