import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./middleware";

export type HealthCheck = {
	source: string;
	type: "warning" | "error";
	message: string;
	wikiUrl: string | null;
};

export type DiskSpaceEntry = {
	path: string;
	label: string;
	freeSpace: number;
	totalSpace: number;
};

export type SystemAbout = {
	version: string;
	runtimeVersion: string;
	sqliteVersion: string;
	databasePath: string;
	databaseSize: number;
	osInfo: string;
	isDocker: boolean;
	uptimeSeconds: number;
	startTime: string;
};

export type SystemStatus = {
	health: HealthCheck[];
	diskSpace: DiskSpaceEntry[];
	about: SystemAbout;
};

export const getSystemStatusFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();
		const { getDiskSpace, getSystemAbout, runHealthChecks } = await import(
			"./system-info"
		);

		return {
			health: await runHealthChecks(),
			diskSpace: await getDiskSpace(),
			about: await getSystemAbout(),
		} satisfies SystemStatus;
	},
);
