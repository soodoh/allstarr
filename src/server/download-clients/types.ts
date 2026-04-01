export type DownloadProtocol = "torrent" | "usenet";
export type CanonicalStatus =
	| "downloading"
	| "completed"
	| "paused"
	| "queued"
	| "failed";
export type ImplementationType =
	| "qBittorrent"
	| "Transmission"
	| "Deluge"
	| "rTorrent"
	| "SABnzbd"
	| "NZBGet"
	| "Blackhole";

export type ConnectionConfig = {
	implementation: ImplementationType;
	host: string;
	port: number;
	useSsl: boolean;
	urlBase: string | null;
	username: string | null;
	password: string | null;
	apiKey: string | null;
	category: string | null;
	tag: string | null;
	settings: Record<string, unknown> | null;
};

export type TestResult = {
	success: boolean;
	message: string;
	version: string | null;
};

export type DownloadRequest = {
	url: string | null;
	torrentData: Buffer | null;
	nzbData: Buffer | null;
	category: string | null;
	tag: string | null;
	savePath: string | null;
};

export type DownloadItem = {
	id: string;
	name: string;
	status: CanonicalStatus;
	size: number;
	downloaded: number;
	uploadSpeed: number;
	downloadSpeed: number;
	category: string | null;
	outputPath: string | null;
	isCompleted: boolean;
};

export type DownloadClientProvider = {
	testConnection(config: ConnectionConfig): Promise<TestResult>;
	addDownload(
		config: ConnectionConfig,
		download: DownloadRequest,
	): Promise<string>;
	getDownloads(config: ConnectionConfig): Promise<DownloadItem[]>;
	removeDownload(
		config: ConnectionConfig,
		id: string,
		deleteFiles: boolean,
	): Promise<void>;
	pauseDownload?(config: ConnectionConfig, id: string): Promise<void>;
	resumeDownload?(config: ConnectionConfig, id: string): Promise<void>;
	setPriority?(
		config: ConnectionConfig,
		id: string,
		priority: number,
	): Promise<void>;
};
