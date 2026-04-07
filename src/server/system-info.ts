import * as fs from "node:fs";
import * as os from "node:os";
import { count, eq } from "drizzle-orm";
import { db } from "src/db";
import {
	downloadClients,
	indexers,
	syncedIndexers,
	unmappedFiles,
} from "src/db/schema";
import { getRootFolderPaths } from "./root-folders";
import type { DiskSpaceEntry, HealthCheck, SystemAbout } from "./system-status";

const startTime = new Date().toISOString();

export async function runHealthChecks(): Promise<HealthCheck[]> {
	const checks: HealthCheck[] = [];

	const folderPaths = getRootFolderPaths();
	if (folderPaths.length === 0) {
		checks.push({
			source: "RootFolderCheck",
			type: "warning",
			message:
				"No root folders have been configured. Set a root folder path on at least one download profile in Settings.",
			wikiUrl: "/settings/profiles",
		});
	} else {
		for (const folderPath of folderPaths) {
			try {
				fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
			} catch {
				checks.push({
					source: "RootFolderCheck",
					type: "error",
					message: `Root folder "${folderPath}" is not accessible or does not exist.`,
					wikiUrl: "/settings/profiles",
				});
			}
		}
	}

	const allIndexers = db.select().from(indexers).all();
	const allSyncedIndexers = db.select().from(syncedIndexers).all();
	if (allIndexers.length === 0 && allSyncedIndexers.length === 0) {
		checks.push({
			source: "IndexerCheck",
			type: "warning",
			message:
				"No indexers have been configured. Add at least one indexer in Settings.",
			wikiUrl: "/settings/indexers",
		});
	}

	const allClients = db.select().from(downloadClients).all();
	if (allClients.length === 0) {
		checks.push({
			source: "DownloadClientCheck",
			type: "warning",
			message:
				"No download clients have been configured. Add at least one download client in Settings.",
			wikiUrl: "/settings/download-clients",
		});
	}

	if (!process.env.HARDCOVER_TOKEN) {
		checks.push({
			source: "HardcoverTokenCheck",
			type: "warning",
			message:
				"No Hardcover API token configured. Search functionality requires a valid token.",
			wikiUrl: "/settings/general",
		});
	}

	try {
		const result = Bun.spawnSync(["ffprobe", "-version"]);
		if (result.exitCode !== 0) {
			throw new Error("ffprobe returned non-zero exit code");
		}
	} catch {
		checks.push({
			source: "SystemDependencyCheck",
			type: "warning",
			message:
				"FFmpeg is not installed. Audio and video metadata extraction will be unavailable. Install ffmpeg for full audio support.",
			wikiUrl: null,
		});
	}

	const unmappedCount = db
		.select({ count: count() })
		.from(unmappedFiles)
		.where(eq(unmappedFiles.ignored, false))
		.get();
	const unmappedTotal = unmappedCount?.count ?? 0;
	if (unmappedTotal > 0) {
		checks.push({
			source: "UnmappedFilesCheck",
			type: "warning",
			message: `${unmappedTotal} unmapped ${unmappedTotal === 1 ? "file" : "files"} found in your root folders. Review and map or ignore them.`,
			wikiUrl: "/unmapped-files",
		});
	}

	return checks;
}

export async function getDiskSpace(): Promise<DiskSpaceEntry[]> {
	const folderPaths = getRootFolderPaths();
	return folderPaths.map((folderPath) => {
		let freeSpace = 0;
		let totalSpace = 0;
		try {
			const stats = fs.statfsSync(folderPath);
			freeSpace = Number(stats.bfree * stats.bsize);
			totalSpace = Number(stats.blocks * stats.bsize);
		} catch {
			// folder may not exist
		}
		return {
			path: folderPath,
			label: folderPath,
			freeSpace,
			totalSpace,
		};
	});
}

export async function getSystemAbout(): Promise<SystemAbout> {
	const dbPath = process.env.DATABASE_URL || "data/sqlite.db";
	let databaseSize = 0;
	try {
		const stat = fs.statSync(dbPath);
		databaseSize = stat.size;
	} catch {
		// file may not exist
	}

	const sqliteVer = (
		db.$client.prepare("SELECT sqlite_version() as v").get() as { v: string }
	).v;

	const isDocker =
		fs.existsSync("/.dockerenv") ||
		((): boolean => {
			try {
				return fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker");
			} catch {
				return false;
			}
		})();

	return {
		version: "0.1.0",
		runtimeVersion: Bun.version,
		sqliteVersion: sqliteVer,
		databasePath: dbPath,
		databaseSize,
		osInfo: `${os.type()} ${os.release()} (${os.arch()})`,
		isDocker,
		uptimeSeconds: process.uptime(),
		startTime,
	};
}
