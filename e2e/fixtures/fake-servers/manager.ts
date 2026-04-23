import PORTS from "../../ports";
import {
	loadGoldenScenario,
	loadGoldenServiceState,
} from "../golden/loaders";
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
type ManagedServerFactory = (seed?: Record<string, unknown>) => ManagedServer;
type GoldenReplacements = Record<string, boolean | number | string>;
type ServicePorts = Partial<Record<ServiceName, number>>;

const SERVICE_DIRECTORIES: Record<ServiceName, string> = {
	QBITTORRENT: "qbittorrent",
	TRANSMISSION: "transmission",
	DELUGE: "deluge",
	RTORRENT: "rtorrent",
	SABNZBD: "sabnzbd",
	NZBGET: "nzbget",
	NEWZNAB: "newznab",
	PROWLARR: "prowlarr",
	HARDCOVER: "hardcover",
	TMDB: "tmdb",
	SONARR: "sonarr",
	RADARR: "radarr",
	READARR: "readarr",
	BOOKSHELF: "bookshelf",
};

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

function applyReplacements(
	value: unknown,
	replacements: GoldenReplacements | undefined,
): unknown {
	if (!replacements) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => applyReplacements(entry, replacements));
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				applyReplacements(entry, replacements),
			]),
		);
	}

	if (typeof value !== "string") {
		return value;
	}

	return Object.entries(replacements).reduce(
		(current, [key, replacement]) =>
			current.replaceAll(`{{${key}}}`, String(replacement)),
		value,
	);
}

function buildFactories(ports: ServicePorts): Record<ServiceName, ManagedServerFactory> {
	return {
	QBITTORRENT: (seed) =>
		createQBittorrentServer(
			ports.QBITTORRENT ?? PORTS.QBITTORRENT,
			seed as Parameters<typeof createQBittorrentServer>[1],
		) as ManagedServer,
	TRANSMISSION: (seed) =>
		createTransmissionServer(
			ports.TRANSMISSION ?? PORTS.TRANSMISSION,
			seed as Parameters<typeof createTransmissionServer>[1],
		) as ManagedServer,
	DELUGE: (seed) =>
		createDelugeServer(
			ports.DELUGE ?? PORTS.DELUGE,
			seed as Parameters<typeof createDelugeServer>[1],
		) as ManagedServer,
	RTORRENT: (seed) =>
		createRTorrentServer(
			ports.RTORRENT ?? PORTS.RTORRENT,
			seed as Parameters<typeof createRTorrentServer>[1],
		) as ManagedServer,
	SABNZBD: (seed) =>
		createSABnzbdServer(
			ports.SABNZBD ?? PORTS.SABNZBD,
			seed as Parameters<typeof createSABnzbdServer>[1],
		) as ManagedServer,
	NZBGET: (seed) =>
		createNZBGetServer(
			ports.NZBGET ?? PORTS.NZBGET,
			seed as Parameters<typeof createNZBGetServer>[1],
		) as ManagedServer,
	NEWZNAB: (seed) =>
		createNewznabServer(
			ports.NEWZNAB ?? PORTS.NEWZNAB,
			seed as Parameters<typeof createNewznabServer>[1],
		) as ManagedServer,
	PROWLARR: (seed) =>
		createProwlarrServer(
			ports.PROWLARR ?? PORTS.PROWLARR,
			seed as Parameters<typeof createProwlarrServer>[1],
		) as ManagedServer,
	HARDCOVER: (seed) =>
		createHardcoverServer(
			ports.HARDCOVER ?? PORTS.HARDCOVER,
			seed as Parameters<typeof createHardcoverServer>[1],
		) as ManagedServer,
	TMDB: (seed) =>
		createTmdbServer(
			ports.TMDB ?? PORTS.TMDB,
			seed as Parameters<typeof createTmdbServer>[1],
		) as ManagedServer,
	SONARR: (seed) =>
		createSonarrServer(
			ports.SONARR ?? PORTS.SONARR,
			seed as Parameters<typeof createSonarrServer>[1],
		) as ManagedServer,
	RADARR: (seed) =>
		createRadarrServer(
			ports.RADARR ?? PORTS.RADARR,
			seed as Parameters<typeof createRadarrServer>[1],
		) as ManagedServer,
	READARR: (seed) =>
		createReadarrServer(
			ports.READARR ?? PORTS.READARR,
			seed as Parameters<typeof createReadarrServer>[1],
		) as ManagedServer,
	BOOKSHELF: (seed) =>
		createBookshelfServer(
			ports.BOOKSHELF ?? PORTS.BOOKSHELF,
			seed as Parameters<typeof createBookshelfServer>[1],
		) as ManagedServer,
};
}

export type FakeServerManager = ReturnType<typeof createFakeServerManager>;

export function createFakeServerManager(
	requiredServices: ServiceName[],
	options?: { ports?: ServicePorts; scenarioName?: string },
) {
	const names = [...new Set(requiredServices)];
	const running = new Map<ServiceName, ManagedServer>();
	const defaultSeeds = new Map<ServiceName, Record<string, unknown>>();
	const factories = buildFactories(options?.ports ?? {});

	async function postJson(url: string, path: string, body: unknown): Promise<void> {
		const response = await fetch(`${url}${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			throw new Error(
				`Failed to POST ${path} to ${url}: ${response.status} ${response.statusText}`,
			);
		}
	}

	async function applyScenarioState(scenarioName: string): Promise<void> {
		const scenario = loadGoldenScenario(scenarioName);

		for (const name of names) {
			const server = running.get(name);
			if (!server) {
				continue;
			}

			const stateName = scenario.services[name];
			if (stateName) {
				const seed = loadGoldenServiceState(
					SERVICE_DIRECTORIES[name],
					stateName,
				).seed;
				await postJson(server.url, "/__seed", seed);
				continue;
			}

			const defaultSeed = defaultSeeds.get(name);
			if (!defaultSeed) {
				throw new Error(`Missing default seed for fake service ${name}`);
			}
			await postJson(server.url, "/__seed", defaultSeed);
		}
	}

	return {
		async start(): Promise<void> {
			for (const name of names) {
				if (!running.has(name)) {
					running.set(name, factories[name]());
				}
			}

			await Promise.all([...running.values()].map((server) => waitForServer(server.url)));

			for (const name of names) {
				if (!defaultSeeds.has(name)) {
					const server = running.get(name);
					if (!server) {
						continue;
					}
					const defaultSeed = await fetch(`${server.url}/__state`).then((response) =>
						response.json(),
					);
					defaultSeeds.set(name, defaultSeed);
				}
			}

			if (options?.scenarioName) {
				await applyScenarioState(options.scenarioName);
			}
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

		async setScenario(scenarioName: string): Promise<void> {
			await applyScenarioState(scenarioName);
		},

		async setServiceState(
			serviceName: ServiceName,
			stateName: string | null,
			replacements?: GoldenReplacements,
		): Promise<void> {
			const server = running.get(serviceName);
			if (!server) {
				throw new Error(`Fake service ${serviceName} is not running`);
			}

			if (!stateName) {
				const defaultSeed = defaultSeeds.get(serviceName);
				if (!defaultSeed) {
					throw new Error(`Missing default seed for fake service ${serviceName}`);
				}
				await postJson(server.url, "/__seed", defaultSeed);
				return;
			}

			const seed = loadGoldenServiceState(
				SERVICE_DIRECTORIES[serviceName],
				stateName,
			).seed;
			await postJson(
				server.url,
				"/__seed",
				applyReplacements(seed, replacements),
			);
		},

		async stop(): Promise<void> {
			await Promise.all([...running.values()].map((server) => server.stop()));
			running.clear();
		},
	};
}
