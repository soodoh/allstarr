import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
	buildCapturedNamedKey,
	buildCapturedPathKey,
	type CapturedResponse,
} from "../fake-servers/captured";
import type { CaptureFilePayload } from "./capture";
import type { GoldenServiceStateFile } from "./schema";

type PromotionArgs = {
	captureRoot: string;
	serviceRoot: string;
};

type CaptureFileEntry = {
	fileName: string;
	payload: CaptureFilePayload;
};

type ComposeLivePromotion = {
	captureService: string;
	captureStateName?: string;
	defaultSeed: Record<string, unknown>;
	keyForCaptureFile: (entry: CaptureFileEntry) => string | null;
	stateName: string;
	targetService: string;
};

function readCaptureFiles(root: string): CaptureFileEntry[] {
	if (!existsSync(root)) {
		return [];
	}
	return readdirSync(root)
		.filter((entry) => entry.endsWith(".json"))
		.sort()
		.map((fileName) => ({
			fileName,
			payload: JSON.parse(
				readFileSync(join(root, fileName), "utf8"),
			) as CaptureFilePayload,
		}));
}

function captureName(fileName: string): string {
	return basename(fileName, ".json");
}

function suffixAfterLastDoubleUnderscore(fileName: string): string {
	const name = captureName(fileName);
	const marker = name.lastIndexOf("__");
	return marker >= 0 ? name.slice(marker + 2) : name;
}

function captureBody(
	payload: CaptureFilePayload,
): CapturedResponse {
	return {
		body: payload.body,
		contentType: payload.contentType,
		status: payload.status,
	};
}

const PROMOTIONS: ComposeLivePromotion[] = [
	{
		captureService: "sonarr",
		defaultSeed: { apiKey: "sonarr-key" },
		keyForCaptureFile: ({ payload }) =>
			buildCapturedPathKey(payload.method, payload.path),
		stateName: "compose-live",
		targetService: "sonarr",
	},
	{
		captureService: "radarr",
		defaultSeed: { apiKey: "radarr-key" },
		keyForCaptureFile: ({ payload }) =>
			buildCapturedPathKey(payload.method, payload.path),
		stateName: "compose-live",
		targetService: "radarr",
	},
	{
		captureService: "readarr",
		defaultSeed: { apiKey: "readarr-key" },
		keyForCaptureFile: ({ payload }) =>
			buildCapturedPathKey(payload.method, payload.path),
		stateName: "compose-live",
		targetService: "readarr",
	},
	{
		captureService: "prowlarr",
		defaultSeed: { apiKey: "test-prowlarr-api-key" },
		keyForCaptureFile: ({ payload }) =>
			buildCapturedPathKey(payload.method, payload.path),
		stateName: "compose-live",
		targetService: "prowlarr",
	},
	{
		captureService: "qbittorrent",
		defaultSeed: {},
		keyForCaptureFile: ({ payload }) =>
			buildCapturedPathKey(payload.method, payload.path),
		stateName: "compose-live",
		targetService: "qbittorrent",
	},
	{
		captureService: "transmission",
		defaultSeed: { sessionId: "test-transmission-session-id" },
		keyForCaptureFile: ({ fileName }) => {
			const suffix = suffixAfterLastDoubleUnderscore(fileName);
			if (suffix === "session_get") {
				return buildCapturedNamedKey("rpc", "session-get");
			}
			if (suffix === "torrent_get") {
				return buildCapturedNamedKey("rpc", "torrent-get");
			}
			return null;
		},
		stateName: "compose-live",
		targetService: "transmission",
	},
	{
		captureService: "deluge",
		defaultSeed: {
			hostId: "test-host-id",
			password: "deluge",
		},
		keyForCaptureFile: ({ fileName }) => {
			const suffix = suffixAfterLastDoubleUnderscore(fileName);
			const method =
				suffix === "auth_login"
					? "auth.login"
					: suffix === "web_get_hosts"
						? "web.get_hosts"
						: suffix === "web_connect"
							? "web.connect"
							: suffix === "daemon_get_version"
								? "daemon.get_version"
								: suffix === "core_get_torrents_status"
									? "core.get_torrents_status"
									: null;
			return method ? buildCapturedNamedKey("rpc", method) : null;
		},
		stateName: "compose-live",
		targetService: "deluge",
	},
	{
		captureService: "rtorrent",
		defaultSeed: {},
		keyForCaptureFile: ({ fileName }) => {
			const suffix = suffixAfterLastDoubleUnderscore(fileName);
			const method =
				suffix === "client_version"
					? "system.client_version"
					: suffix === "download_list"
						? "download_list"
						: suffix === "torrent_name"
							? "d.name"
							: suffix === "torrent_directory"
								? "d.directory"
								: suffix === "torrent_complete"
									? "d.complete"
									: null;
			return method ? buildCapturedNamedKey("xmlrpc", method) : null;
		},
		stateName: "compose-live",
		targetService: "rtorrent",
	},
	{
		captureService: "sabnzbd",
		defaultSeed: { apiKey: "test-sabnzbd-api-key" },
		keyForCaptureFile: ({ fileName }) => {
			const suffix = suffixAfterLastDoubleUnderscore(fileName);
			const mode =
				suffix === "version"
					? "version"
					: suffix === "queue"
						? "queue"
						: suffix === "history"
							? "history"
							: null;
			return mode ? buildCapturedNamedKey("mode", mode) : null;
		},
		stateName: "compose-live",
		targetService: "sabnzbd",
	},
	{
		captureService: "nzbget",
		defaultSeed: {
			password: "nzbget",
			username: "nzbget",
		},
		keyForCaptureFile: ({ fileName }) => {
			const suffix = suffixAfterLastDoubleUnderscore(fileName);
			const method =
				suffix === "version"
					? "version"
					: suffix === "listgroups"
						? "listgroups"
						: suffix === "history"
							? "history"
							: null;
			return method ? buildCapturedNamedKey("rpc", method) : null;
		},
		stateName: "compose-live",
		targetService: "nzbget",
	},
	{
		captureService: "torznab-proxy",
		captureStateName: "compose-live-nyaa",
		defaultSeed: { apiKey: "test-prowlarr-api-key" },
		keyForCaptureFile: ({ fileName }) => {
			const suffix = suffixAfterLastDoubleUnderscore(fileName);
			const type =
				suffix === "caps" ? "caps" : suffix === "search" ? "search" : null;
			return type ? buildCapturedNamedKey("t", type) : null;
		},
		stateName: "compose-live",
		targetService: "prowlarr",
	},
];

export function promoteComposeLiveFixtures(args: PromotionArgs): void {
	for (const promotion of PROMOTIONS) {
		const captureDir = join(
			args.captureRoot,
			promotion.captureService,
			promotion.captureStateName ?? promotion.stateName,
		);
		const files = readCaptureFiles(captureDir);
		const capturedResponses = Object.fromEntries(
			files.flatMap((entry) => {
				const key = promotion.keyForCaptureFile(entry);
				return key ? [[key, captureBody(entry.payload)]] : [];
			}),
		);

		const outputPath = join(
			args.serviceRoot,
			promotion.targetService,
			promotion.stateName,
			"state.json",
		);
		mkdirSync(join(args.serviceRoot, promotion.targetService, promotion.stateName), {
			recursive: true,
		});

		const existingState = existsSync(outputPath)
			? (JSON.parse(readFileSync(outputPath, "utf8")) as GoldenServiceStateFile)
			: null;
		const existingSeed =
			existingState?.seed && typeof existingState.seed === "object"
				? (existingState.seed as Record<string, unknown>)
				: {};
		const existingCapturedResponses =
			existingSeed.capturedResponses &&
			typeof existingSeed.capturedResponses === "object" &&
			!Array.isArray(existingSeed.capturedResponses)
				? (existingSeed.capturedResponses as Record<string, CapturedResponse>)
				: {};

		const state: GoldenServiceStateFile = {
			name: promotion.stateName,
			seed: {
				...existingSeed,
				...promotion.defaultSeed,
				capturedResponses: {
					...existingCapturedResponses,
					...capturedResponses,
				},
			},
			service: promotion.targetService,
		};

		writeFileSync(outputPath, JSON.stringify(state, null, 2));
	}
}
