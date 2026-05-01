import {
	formatDiagnosticLine,
	timeDiagnosticOperation,
} from "../../helpers/diagnostics";
import PORTS from "../../ports";
import { loadGoldenScenario, loadGoldenServiceState } from "../golden/loaders";
import type { FakeServer } from "./base";
import createBookshelfServer from "./bookshelf";
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
type FakeServerManagerOptions = {
	ports?: ServicePorts;
	scenarioName?: string;
	readinessTimeoutMs?: number;
	readinessIntervalMs?: number;
};

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

async function waitForServer(
	serviceName: ServiceName,
	url: string,
	options?: { timeoutMs?: number; intervalMs?: number },
): Promise<void> {
	const timeoutMs = options?.timeoutMs ?? 5_000;
	const intervalMs = options?.intervalMs ?? 100;
	const endpoint = "/__state";
	const startedAt = Date.now();
	let attempts = 0;
	let lastError = "not ready";

	while (Date.now() - startedAt < timeoutMs) {
		attempts += 1;
		try {
			const response = await fetch(`${url}${endpoint}`);
			if (response.ok) {
				console.info(
					formatDiagnosticLine({
						scope: "fake-service",
						event: "ready",
						status: "ok",
						elapsedMs: Date.now() - startedAt,
						fields: { service: serviceName, url, endpoint, attempts },
					}),
				);
				return;
			}
			lastError = `${response.status} ${response.statusText}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	const elapsedMs = Date.now() - startedAt;
	console.info(
		formatDiagnosticLine({
			scope: "fake-service",
			event: "ready",
			status: "error",
			elapsedMs,
			fields: {
				service: serviceName,
				url,
				endpoint,
				attempts,
				error: lastError,
			},
		}),
	);

	throw new Error(
		`Fake service ${serviceName} at ${url}${endpoint} did not become ready after ${attempts} attempts in ${elapsedMs}ms: ${lastError}`,
	);
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

function buildFactories(
	ports: ServicePorts,
): Record<ServiceName, ManagedServerFactory> {
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
	options?: FakeServerManagerOptions,
) {
	const names = [...new Set(requiredServices)];
	const running = new Map<ServiceName, ManagedServer>();
	const defaultSeeds = new Map<ServiceName, Record<string, unknown>>();
	const factories = buildFactories(options?.ports ?? {});

	async function postJson(
		url: string,
		path: string,
		body: unknown,
		fields?: Record<string, boolean | number | string | null | undefined>,
	): Promise<void> {
		await timeDiagnosticOperation(
			{
				scope: "fake-service",
				event: "post-json",
				fields: { url, path, ...fields },
			},
			async () => {
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
			},
		);
	}

	async function applyScenarioState(scenarioName: string): Promise<void> {
		await timeDiagnosticOperation(
			{
				scope: "fake-service",
				event: "apply-scenario",
				fields: { scenarioName, runningServiceCount: running.size },
			},
			async () => {
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
						await postJson(server.url, "/__seed", seed, {
							service: name,
							scenarioName,
							stateName,
						});
						continue;
					}

					const defaultSeed = defaultSeeds.get(name);
					if (!defaultSeed) {
						throw new Error(`Missing default seed for fake service ${name}`);
					}
					await postJson(server.url, "/__seed", defaultSeed, {
						service: name,
						scenarioName,
						stateName: "default",
					});
				}
			},
		);
	}

	async function resetService(
		name: ServiceName,
		server: ManagedServer,
	): Promise<void> {
		await timeDiagnosticOperation(
			{
				scope: "fake-service",
				event: "reset",
				fields: { service: name, url: server.url, path: "/__reset" },
			},
			async () => {
				const response = await fetch(`${server.url}/__reset`, {
					method: "POST",
				});
				if (!response.ok) {
					throw new Error(
						`Failed to reset fake service ${name}: POST /__reset returned ${response.status} ${response.statusText}`,
					);
				}
			},
		);
	}

	return {
		async start(): Promise<void> {
			try {
				await timeDiagnosticOperation(
					{
						scope: "fake-service",
						event: "start-all",
						fields: { runningServiceCount: names.length },
					},
					async () => {
						for (const name of names) {
							if (!running.has(name)) {
								running.set(name, factories[name]());
							}
						}

						await Promise.all(
							[...running.entries()].map(([name, server]) =>
								waitForServer(name, server.url, {
									timeoutMs: options?.readinessTimeoutMs,
									intervalMs: options?.readinessIntervalMs,
								}),
							),
						);

						for (const name of names) {
							if (!defaultSeeds.has(name)) {
								const server = running.get(name);
								if (!server) {
									continue;
								}
								const defaultSeed = await timeDiagnosticOperation(
									{
										scope: "fake-service",
										event: "read-default-state",
										fields: {
											service: name,
											url: server.url,
											endpoint: "/__state",
										},
									},
									async () => {
										const response = await fetch(`${server.url}/__state`);
										if (!response.ok) {
											throw new Error(
												`Failed to read default state for fake service ${name}: ${response.status} ${response.statusText}`,
											);
										}
										return response.json() as Promise<Record<string, unknown>>;
									},
								);
								defaultSeeds.set(name, defaultSeed);
							}
						}

						if (options?.scenarioName) {
							await applyScenarioState(options.scenarioName);
						}
					},
				);
			} catch (error) {
				await Promise.allSettled(
					[...running.values()].map((server) => server.stop()),
				);
				running.clear();
				throw error;
			}
		},

		getUrls(): ServiceUrls {
			return Object.fromEntries(
				[...running.entries()].map(([name, server]) => [name, server.url]),
			) as ServiceUrls;
		},

		async reset(): Promise<void> {
			await timeDiagnosticOperation(
				{
					scope: "fake-service",
					event: "reset-all",
					fields: { runningServiceCount: running.size },
				},
				async () => {
					await Promise.all(
						[...running.entries()].map(([name, server]) =>
							resetService(name, server),
						),
					);
				},
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
			await timeDiagnosticOperation(
				{
					scope: "fake-service",
					event: "set-service-state",
					fields: { service: serviceName, stateName: stateName ?? "default" },
				},
				async () => {
					const server = running.get(serviceName);
					if (!server) {
						throw new Error(`Fake service ${serviceName} is not running`);
					}

					if (!stateName) {
						const defaultSeed = defaultSeeds.get(serviceName);
						if (!defaultSeed) {
							throw new Error(
								`Missing default seed for fake service ${serviceName}`,
							);
						}
						await postJson(server.url, "/__seed", defaultSeed, {
							service: serviceName,
							stateName: "default",
						});
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
						{ service: serviceName, stateName },
					);
				},
			);
		},

		async stop(): Promise<void> {
			await timeDiagnosticOperation(
				{
					scope: "fake-service",
					event: "stop-all",
					fields: { runningServiceCount: running.size },
				},
				async () => {
					await Promise.all(
						[...running.values()].map((server) => server.stop()),
					);
					running.clear();
				},
			);
		},
	};
}
