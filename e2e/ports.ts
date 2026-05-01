// Fixed ports for fake servers (started once in global setup)
const PORTS = {
	QBITTORRENT: 19_001,
	TRANSMISSION: 19_002,
	DELUGE: 19_003,
	RTORRENT: 19_004,
	SABNZBD: 19_005,
	NZBGET: 19_006,
	NEWZNAB: 19_007,
	PROWLARR: 19_008,
	HARDCOVER: 19_009,
	TMDB: 19_010,
	SONARR: 19_011,
	RADARR: 19_012,
	READARR: 19_013,
	BOOKSHELF: 19_014,
	// App server ports start at 19100, incremented per worker
	APP_BASE: 19_100,
} as const;

export default PORTS;
