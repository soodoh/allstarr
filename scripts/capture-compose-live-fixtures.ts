import { resolve } from "node:path";
import { captureFixtureSet } from "../e2e/fixtures/golden/capture";
import { buildComposeLiveCaptureConfigs } from "../e2e/fixtures/golden/compose-live";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable ${name}`);
	}

	return value;
}

function getSetCookieValue(cookieHeader: string | null, name: string): string {
	if (!cookieHeader) {
		throw new Error(`Missing Set-Cookie header for ${name}`);
	}

	const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
	if (!match) {
		throw new Error(`Could not extract ${name} from Set-Cookie header`);
	}

	return match[1];
}

async function loginQbittorrent(password: string): Promise<string> {
	const response = await fetch("http://127.0.0.1:28081/api/v2/auth/login", {
		body: new URLSearchParams({
			password,
			username: "admin",
		}).toString(),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
			Host: "localhost:8081",
			Origin: "http://localhost:8081",
			Referer: "http://localhost:8081/",
		},
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(`qBittorrent login failed with ${response.status}`);
	}

	return getSetCookieValue(response.headers.get("set-cookie"), "SID");
}

async function getTransmissionSessionId(): Promise<string> {
	const response = await fetch("http://127.0.0.1:29091/transmission/rpc", {
		method: "POST",
	});
	const sessionId = response.headers.get("X-Transmission-Session-Id");

	if (!sessionId) {
		throw new Error(
			`Transmission did not return a session id, status ${response.status}`,
		);
	}

	return sessionId;
}

async function loginDeluge(password: string): Promise<{
	hostId: string;
	sessionCookie: string;
}> {
	const loginResponse = await fetch("http://127.0.0.1:28112/json", {
		body: JSON.stringify({
			id: 1,
			method: "auth.login",
			params: [password],
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	if (!loginResponse.ok) {
		throw new Error(`Deluge auth.login failed with ${loginResponse.status}`);
	}

	const sessionCookie = getSetCookieValue(
		loginResponse.headers.get("set-cookie"),
		"_session_id",
	);
	const cookieHeader = `_session_id=${sessionCookie}`;
	const hostsResponse = await fetch("http://127.0.0.1:28112/json", {
		body: JSON.stringify({
			id: 2,
			method: "web.get_hosts",
			params: [],
		}),
		headers: {
			"Content-Type": "application/json",
			Cookie: cookieHeader,
		},
		method: "POST",
	});
	const hostsPayload = (await hostsResponse.json()) as {
		result?: Array<[string, string, number, string, string]>;
	};
	const hostId = hostsPayload.result?.[0]?.[0];

	if (!hostId) {
		throw new Error("Deluge did not return a daemon host id");
	}

	await fetch("http://127.0.0.1:28112/json", {
		body: JSON.stringify({
			id: 3,
			method: "web.connect",
			params: [hostId],
		}),
		headers: {
			"Content-Type": "application/json",
			Cookie: cookieHeader,
		},
		method: "POST",
	});

	return { hostId, sessionCookie };
}

async function getRtorrentHash(): Promise<string | null> {
	const response = await fetch("http://127.0.0.1:28000/", {
		body: '<?xml version="1.0"?><methodCall><methodName>download_list</methodName><params></params></methodCall>',
		headers: { "Content-Type": "text/xml" },
		method: "POST",
	});
	const body = await response.text();
	const match = body.match(
		/<methodResponse>.*?<string>([A-Fa-f0-9]+)<\/string>.*?<\/methodResponse>/s,
	);

	return match?.[1] ?? null;
}

async function main(): Promise<void> {
	const outputRoot = resolve(
		process.cwd(),
		"e2e/fixtures/golden/_captures/live-compose",
	);
	const qbittorrentSid = await loginQbittorrent(
		requireEnv("QBITTORRENT_PASSWORD"),
	);
	const transmissionSessionId = await getTransmissionSessionId();
	const deluge = await loginDeluge(process.env.DELUGE_PASSWORD ?? "deluge");
	const rtorrentHash = await getRtorrentHash();
	const configs = buildComposeLiveCaptureConfigs({
		delugeHostId: deluge.hostId,
		delugeSessionCookie: deluge.sessionCookie,
		nzbgetPassword: process.env.NZBGET_PASSWORD ?? "tegbzn6789",
		nzbgetUsername: process.env.NZBGET_USERNAME ?? "nzbget",
		outputRoot,
		prowlarrApiKey: requireEnv("PROWLARR_API_KEY"),
		qbittorrentSid,
		radarrApiKey: requireEnv("RADARR_API_KEY"),
		readarrApiKey: requireEnv("READARR_API_KEY"),
		rtorrentHash,
		sabnzbdApiKey: requireEnv("SABNZBD_API_KEY"),
		sonarrApiKey: requireEnv("SONARR_API_KEY"),
		transmissionSessionId,
	});

	for (const config of configs) {
		await captureFixtureSet(config);
	}
}

await main();
