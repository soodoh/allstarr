import type {
	ConnectionConfig,
	DownloadClientProvider,
} from "./download-clients/types";
import type { IndexerRelease } from "./indexers/types";

type DownloadClientRow = {
	id: number;
	name: string;
	implementation: string;
	host: string;
	port: number;
	useSsl: boolean;
	urlBase: string | null;
	username: string | null;
	password: string | null;
	apiKey: string | null;
	category: string | null;
	tag: string | null;
	settings: unknown;
};

type DispatchRelease = Pick<
	IndexerRelease,
	"allstarrIndexerId" | "downloadUrl" | "guid" | "protocol" | "size" | "title"
> & {
	quality: { name: string };
};

type ResolvedDownloadClient = {
	client: DownloadClientRow;
	combinedTag: string | null;
};

type DispatchContext<TRelease extends DispatchRelease> = {
	client: DownloadClientRow;
	downloadId: string;
	release: TRelease;
};

export type DispatchAutoSearchDownloadOptions<
	TRelease extends DispatchRelease,
	TTracked,
	THistory,
> = {
	getProvider: (
		implementation: string,
	) => Promise<Pick<DownloadClientProvider, "addDownload">>;
	history: (context: DispatchContext<TRelease>) => THistory;
	insertHistory: (history: THistory) => void;
	insertTrackedDownload: (trackedDownload: TTracked) => void;
	logWarn: (prefix: string, message: string) => void;
	release: TRelease;
	resolveDownloadClient: (
		release: TRelease,
	) => ResolvedDownloadClient | null | Promise<ResolvedDownloadClient | null>;
	trackedDownload: (context: DispatchContext<TRelease>) => TTracked;
};

function buildConnectionConfig(client: DownloadClientRow): ConnectionConfig {
	return {
		implementation: client.implementation as ConnectionConfig["implementation"],
		host: client.host,
		port: client.port,
		useSsl: client.useSsl,
		urlBase: client.urlBase,
		username: client.username,
		password: client.password,
		apiKey: client.apiKey,
		category: client.category,
		tag: client.tag,
		settings: client.settings as Record<string, unknown> | null,
	};
}

export async function dispatchAutoSearchDownload<
	TRelease extends DispatchRelease,
	TTracked,
	THistory,
>({
	getProvider,
	history,
	insertHistory,
	insertTrackedDownload,
	logWarn,
	release,
	resolveDownloadClient,
	trackedDownload,
}: DispatchAutoSearchDownloadOptions<
	TRelease,
	TTracked,
	THistory
>): Promise<boolean> {
	const resolved = await resolveDownloadClient(release);
	if (!resolved) {
		logWarn(
			"auto-search",
			`No enabled ${release.protocol} download client for "${release.title}"`,
		);
		return false;
	}

	const { client, combinedTag } = resolved;
	const provider = await getProvider(client.implementation);
	const downloadId = await provider.addDownload(buildConnectionConfig(client), {
		url: release.downloadUrl,
		torrentData: null,
		nzbData: null,
		category: null,
		tag: combinedTag,
		savePath: null,
	});
	const context = { client, downloadId, release };

	if (downloadId) {
		insertTrackedDownload(trackedDownload(context));
	}

	insertHistory(history(context));
	return true;
}
