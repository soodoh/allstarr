import PORTS from "../../ports";
import type { FakeServer } from "./base";
import createDelugeServer from "./deluge";
import createHardcoverServer from "./hardcover";
import createNewznabServer from "./newznab";
import createNZBGetServer from "./nzbget";
import createProwlarrServer from "./prowlarr";
import createQBittorrentServer from "./qbittorrent";
import createRadarrServer from "./radarr";
import createReadarrServer from "./readarr";
import createRTorrentServer from "./rtorrent";
import createSABnzbdServer from "./sabnzbd";
import createSonarrServer from "./sonarr";
import createTmdbServer from "./tmdb";
import createTransmissionServer from "./transmission";
import createBookshelfServer from "./bookshelf";

export type ServiceName = Exclude<keyof typeof PORTS, "APP_BASE">;
export type ServiceUrls = Partial<Record<ServiceName, string>>;

export const ALL_REQUIRED_SERVICES: ServiceName[] = [
	"QBITTORRENT",
	"TRANSMISSION",
	"DELUGE",
	"RTORRENT",
	"SABNZBD",
	"NZBGET",
	"NEWZNAB",
	"PROWLARR",
	"HARDCOVER",
];

type ManagedServer = FakeServer<Record<string, unknown>>;

async function waitForServer(url: string): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			const response = await fetch(`${url}/__state`);
			if (response.ok) {
				return;
			}
		} catch {
			// Server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	throw new Error(`Fake server at ${url} did not start in time`);
}

const factories: Record<ServiceName, () => ManagedServer> = {
	QBITTORRENT: () => createQBittorrentServer(PORTS.QBITTORRENT) as ManagedServer,
	TRANSMISSION: () =>
		createTransmissionServer(PORTS.TRANSMISSION) as ManagedServer,
	DELUGE: () => createDelugeServer(PORTS.DELUGE) as ManagedServer,
	RTORRENT: () => createRTorrentServer(PORTS.RTORRENT) as ManagedServer,
	SABNZBD: () => createSABnzbdServer(PORTS.SABNZBD) as ManagedServer,
	NZBGET: () => createNZBGetServer(PORTS.NZBGET) as ManagedServer,
	NEWZNAB: () => createNewznabServer(PORTS.NEWZNAB) as ManagedServer,
	PROWLARR: () => createProwlarrServer(PORTS.PROWLARR) as ManagedServer,
	HARDCOVER: () => createHardcoverServer(PORTS.HARDCOVER) as ManagedServer,
	TMDB: () => createTmdbServer(PORTS.TMDB) as ManagedServer,
	SONARR: () => createSonarrServer(PORTS.SONARR) as ManagedServer,
	RADARR: () => createRadarrServer(PORTS.RADARR) as ManagedServer,
	READARR: () => createReadarrServer(PORTS.READARR) as ManagedServer,
	BOOKSHELF: () => createBookshelfServer(PORTS.BOOKSHELF) as ManagedServer,
};

export type FakeServerManager = ReturnType<typeof createFakeServerManager>;

export function createFakeServerManager(requiredServices: ServiceName[]) {
	const names = [...new Set(requiredServices)];
	const running = new Map<ServiceName, ManagedServer>();

	return {
		async start(): Promise<void> {
			for (const name of names) {
				if (!running.has(name)) {
					running.set(name, factories[name]());
				}
			}

			await Promise.all([...running.values()].map((server) => waitForServer(server.url)));
		},

		getUrls(): ServiceUrls {
			return Object.fromEntries(
				[...running.entries()].map(([name, server]) => [name, server.url]),
			) as ServiceUrls;
		},

		async reset(): Promise<void> {
			await Promise.all(
				[...running.values()].map((server) =>
					fetch(`${server.url}/__reset`, { method: "POST" }),
				),
			);
		},

		async stop(): Promise<void> {
			await Promise.all([...running.values()].map((server) => server.stop()));
			running.clear();
		},
	};
}
