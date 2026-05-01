import type { CaptureConfig } from "./capture";

const DEFAULT_BASE_URLS = {
	deluge: "http://127.0.0.1:28112",
	nzbget: "http://127.0.0.1:26789",
	prowlarr: "http://127.0.0.1:29696",
	qbittorrent: "http://127.0.0.1:28081",
	radarr: "http://127.0.0.1:27878",
	readarr: "http://127.0.0.1:28787",
	rtorrent: "http://127.0.0.1:28000",
	sabnzbd: "http://127.0.0.1:28080",
	sonarr: "http://127.0.0.1:28989",
	transmission: "http://127.0.0.1:29091",
} as const;

type ComposeLiveBaseUrls = typeof DEFAULT_BASE_URLS;
type ComposeLiveUrlOverrides = Partial<
	Record<keyof ComposeLiveBaseUrls, string>
>;

export type ComposeLiveCaptureSecrets = {
	delugeHostId: string;
	delugeSessionCookie: string;
	prowlarrApiKey: string;
	qbittorrentSid: string;
	radarrApiKey: string;
	readarrApiKey: string;
	rtorrentHash?: string | null;
	sabnzbdApiKey: string;
	sonarrApiKey: string;
	transmissionSessionId: string;
	nzbgetPassword?: string;
	nzbgetUsername?: string;
	outputRoot: string;
	urls?: ComposeLiveUrlOverrides;
};

export function buildComposeLiveCaptureConfigs(
	options: ComposeLiveCaptureSecrets,
): CaptureConfig[] {
	const {
		delugeHostId,
		delugeSessionCookie,
		nzbgetPassword = "tegbzn6789",
		nzbgetUsername = "nzbget",
		outputRoot,
		prowlarrApiKey,
		qbittorrentSid,
		radarrApiKey,
		readarrApiKey,
		rtorrentHash,
		sabnzbdApiKey,
		sonarrApiKey,
		transmissionSessionId,
		urls = {},
	} = options;
	const baseUrls = { ...DEFAULT_BASE_URLS, ...urls };

	const rtorrentEndpoints: CaptureConfig["endpoints"] = [
		{
			body: '<?xml version="1.0"?><methodCall><methodName>system.client_version</methodName><params></params></methodCall>',
			headers: { "Content-Type": "text/xml" },
			method: "POST",
			name: "client-version",
			path: "/",
		},
		{
			body: '<?xml version="1.0"?><methodCall><methodName>download_list</methodName><params></params></methodCall>',
			headers: { "Content-Type": "text/xml" },
			method: "POST",
			name: "download-list",
			path: "/",
		},
	];

	if (rtorrentHash) {
		rtorrentEndpoints.push(
			{
				body: `<?xml version="1.0"?><methodCall><methodName>d.name</methodName><params><param><value><string>${rtorrentHash}</string></value></param></params></methodCall>`,
				headers: { "Content-Type": "text/xml" },
				method: "POST",
				name: "torrent-name",
				path: "/",
			},
			{
				body: `<?xml version="1.0"?><methodCall><methodName>d.directory</methodName><params><param><value><string>${rtorrentHash}</string></value></param></params></methodCall>`,
				headers: { "Content-Type": "text/xml" },
				method: "POST",
				name: "torrent-directory",
				path: "/",
			},
			{
				body: `<?xml version="1.0"?><methodCall><methodName>d.complete</methodName><params><param><value><string>${rtorrentHash}</string></value></param></params></methodCall>`,
				headers: { "Content-Type": "text/xml" },
				method: "POST",
				name: "torrent-complete",
				path: "/",
			},
		);
	}

	return [
		{
			baseUrl: baseUrls.sonarr,
			endpoints: [
				{
					name: "config-naming",
					method: "GET",
					path: "/api/v3/config/naming",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "config-mediamanagement",
					method: "GET",
					path: "/api/v3/config/mediamanagement",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "downloadclients",
					method: "GET",
					path: "/api/v3/downloadclient",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "indexers",
					method: "GET",
					path: "/api/v3/indexer",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "rootfolders",
					method: "GET",
					path: "/api/v3/rootfolder",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "qualityprofiles",
					method: "GET",
					path: "/api/v3/qualityprofile",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "series",
					method: "GET",
					path: "/api/v3/series",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "episodes",
					method: "GET",
					path: "/api/v3/episode?seriesId=1",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "episodefiles",
					method: "GET",
					path: "/api/v3/episodefile?seriesId=1",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "history",
					method: "GET",
					path: "/api/v3/history?page=1&pageSize=250",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "queue",
					method: "GET",
					path: "/api/v3/queue?page=1&pageSize=250",
					headers: { "X-Api-Key": sonarrApiKey },
				},
				{
					name: "blocklist",
					method: "GET",
					path: "/api/v3/blocklist?page=1&pageSize=250",
					headers: { "X-Api-Key": sonarrApiKey },
				},
			],
			outputRoot,
			service: "sonarr",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.radarr,
			endpoints: [
				{
					name: "config-naming",
					method: "GET",
					path: "/api/v3/config/naming",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "config-mediamanagement",
					method: "GET",
					path: "/api/v3/config/mediamanagement",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "downloadclients",
					method: "GET",
					path: "/api/v3/downloadclient",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "indexers",
					method: "GET",
					path: "/api/v3/indexer",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "rootfolders",
					method: "GET",
					path: "/api/v3/rootfolder",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "qualityprofiles",
					method: "GET",
					path: "/api/v3/qualityprofile",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "movies",
					method: "GET",
					path: "/api/v3/movie",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "moviefiles",
					method: "GET",
					path: "/api/v3/moviefile?movieId=1",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "history",
					method: "GET",
					path: "/api/v3/history?page=1&pageSize=250",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "queue",
					method: "GET",
					path: "/api/v3/queue?page=1&pageSize=250",
					headers: { "X-Api-Key": radarrApiKey },
				},
				{
					name: "blocklist",
					method: "GET",
					path: "/api/v3/blocklist?page=1&pageSize=250",
					headers: { "X-Api-Key": radarrApiKey },
				},
			],
			outputRoot,
			service: "radarr",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.readarr,
			endpoints: [
				{
					name: "config-naming",
					method: "GET",
					path: "/api/v1/config/naming",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "config-mediamanagement",
					method: "GET",
					path: "/api/v1/config/mediamanagement",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "downloadclients",
					method: "GET",
					path: "/api/v1/downloadclient",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "indexers",
					method: "GET",
					path: "/api/v1/indexer",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "rootfolders",
					method: "GET",
					path: "/api/v1/rootfolder",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "qualityprofiles",
					method: "GET",
					path: "/api/v1/qualityprofile",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "metadataprofiles",
					method: "GET",
					path: "/api/v1/metadataprofile",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "authors",
					method: "GET",
					path: "/api/v1/author",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "books",
					method: "GET",
					path: "/api/v1/book",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "history",
					method: "GET",
					path: "/api/v1/history?page=1&pageSize=250",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "queue",
					method: "GET",
					path: "/api/v1/queue?page=1&pageSize=250",
					headers: { "X-Api-Key": readarrApiKey },
				},
				{
					name: "blocklist",
					method: "GET",
					path: "/api/v1/blocklist?page=1&pageSize=250",
					headers: { "X-Api-Key": readarrApiKey },
				},
			],
			outputRoot,
			service: "readarr",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.prowlarr,
			endpoints: [
				{
					name: "health",
					method: "GET",
					path: "/api/v1/health",
					headers: { "X-Api-Key": prowlarrApiKey },
				},
				{
					name: "system-status",
					method: "GET",
					path: "/api/v1/system/status",
					headers: { "X-Api-Key": prowlarrApiKey },
				},
				{
					name: "indexers",
					method: "GET",
					path: "/api/v1/indexer",
					headers: { "X-Api-Key": prowlarrApiKey },
				},
				{
					name: "applications",
					method: "GET",
					path: "/api/v1/applications",
					headers: { "X-Api-Key": prowlarrApiKey },
				},
				{
					name: "applications-schema",
					method: "GET",
					path: "/api/v1/applications/schema",
					headers: { "X-Api-Key": prowlarrApiKey },
				},
			],
			outputRoot,
			service: "prowlarr",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.prowlarr,
			endpoints: [
				{
					name: "caps",
					method: "GET",
					path: `/1/api?t=caps&extended=1&apikey=${prowlarrApiKey}`,
				},
				{
					name: "search",
					method: "GET",
					path: `/1/api?t=search&q=matrix&cat=2000&extended=1&apikey=${prowlarrApiKey}`,
				},
			],
			outputRoot,
			service: "torznab-proxy",
			stateName: "compose-live-nyaa",
		},
		{
			baseUrl: baseUrls.qbittorrent,
			endpoints: [
				{
					headers: {
						Cookie: `SID=${qbittorrentSid}`,
						Host: "localhost:8081",
					},
					method: "GET",
					name: "torrents-info",
					path: "/api/v2/torrents/info?hashes=all",
				},
			],
			outputRoot,
			service: "qbittorrent",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.transmission,
			endpoints: [
				{
					body: '{"method":"session-get","arguments":{}}',
					headers: {
						"Content-Type": "application/json",
						"X-Transmission-Session-Id": transmissionSessionId,
					},
					method: "POST",
					name: "session-get",
					path: "/transmission/rpc",
				},
				{
					body: '{"method":"torrent-get","arguments":{"fields":["id","name","percentDone","status","downloadDir","hashString"]}}',
					headers: {
						"Content-Type": "application/json",
						"X-Transmission-Session-Id": transmissionSessionId,
					},
					method: "POST",
					name: "torrent-get",
					path: "/transmission/rpc",
				},
			],
			outputRoot,
			service: "transmission",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.deluge,
			endpoints: [
				{
					body: '{"method":"auth.login","params":["deluge"],"id":1}',
					headers: { "Content-Type": "application/json" },
					method: "POST",
					name: "auth-login",
					path: "/json",
				},
				{
					body: '{"method":"web.get_hosts","params":[],"id":2}',
					headers: {
						"Content-Type": "application/json",
						Cookie: `_session_id=${delugeSessionCookie}`,
					},
					method: "POST",
					name: "web-get-hosts",
					path: "/json",
				},
				{
					body: `{"method":"web.connect","params":["${delugeHostId}"],"id":3}`,
					headers: {
						"Content-Type": "application/json",
						Cookie: `_session_id=${delugeSessionCookie}`,
					},
					method: "POST",
					name: "web-connect",
					path: "/json",
				},
				{
					body: '{"method":"daemon.get_version","params":[],"id":4}',
					headers: {
						"Content-Type": "application/json",
						Cookie: `_session_id=${delugeSessionCookie}`,
					},
					method: "POST",
					name: "daemon-get-version",
					path: "/json",
				},
				{
					body: '{"method":"core.get_torrents_status","params":[{},["name","state","progress","save_path","total_done","total_size"]],"id":5}',
					headers: {
						"Content-Type": "application/json",
						Cookie: `_session_id=${delugeSessionCookie}`,
					},
					method: "POST",
					name: "core-get-torrents-status",
					path: "/json",
				},
			],
			outputRoot,
			service: "deluge",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.rtorrent,
			endpoints: rtorrentEndpoints,
			outputRoot,
			service: "rtorrent",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.sabnzbd,
			endpoints: [
				{
					name: "version",
					method: "GET",
					path: `/api?mode=version&output=json&apikey=${sabnzbdApiKey}`,
				},
				{
					name: "queue",
					method: "GET",
					path: `/api?mode=queue&output=json&apikey=${sabnzbdApiKey}`,
				},
				{
					name: "history",
					method: "GET",
					path: `/api?mode=history&output=json&apikey=${sabnzbdApiKey}`,
				},
			],
			outputRoot,
			service: "sabnzbd",
			stateName: "compose-live",
		},
		{
			baseUrl: baseUrls.nzbget,
			endpoints: [
				{
					body: '{"method":"version","params":[],"id":1}',
					headers: {
						Authorization: `Basic ${btoa(`${nzbgetUsername}:${nzbgetPassword}`)}`,
						"Content-Type": "application/json",
					},
					method: "POST",
					name: "version",
					path: "/jsonrpc",
				},
				{
					body: '{"method":"listgroups","params":[0],"id":2}',
					headers: {
						Authorization: `Basic ${btoa(`${nzbgetUsername}:${nzbgetPassword}`)}`,
						"Content-Type": "application/json",
					},
					method: "POST",
					name: "listgroups",
					path: "/jsonrpc",
				},
				{
					body: '{"method":"history","params":[],"id":3}',
					headers: {
						Authorization: `Basic ${btoa(`${nzbgetUsername}:${nzbgetPassword}`)}`,
						"Content-Type": "application/json",
					},
					method: "POST",
					name: "history",
					path: "/jsonrpc",
				},
			],
			outputRoot,
			service: "nzbget",
			stateName: "compose-live",
		},
	];
}
