import blackholeProvider from "./blackhole";
import delugeProvider from "./deluge";
import nzbgetProvider from "./nzbget";
import qbittorrentProvider from "./qbittorrent";
import rtorrentProvider from "./rtorrent";
import sabnzbdProvider from "./sabnzbd";
import transmissionProvider from "./transmission";
import type { DownloadClientProvider, ImplementationType } from "./types";

const providers: Record<ImplementationType, DownloadClientProvider> = {
	qBittorrent: qbittorrentProvider,
	Transmission: transmissionProvider,
	Deluge: delugeProvider,
	rTorrent: rtorrentProvider,
	SABnzbd: sabnzbdProvider,
	NZBGet: nzbgetProvider,
	Blackhole: blackholeProvider,
};

export default function getProvider(
	implementation: string,
): DownloadClientProvider {
	const provider = providers[implementation as ImplementationType];
	if (!provider) {
		throw new Error(
			`Unknown download client implementation: ${implementation}`,
		);
	}
	return provider;
}
