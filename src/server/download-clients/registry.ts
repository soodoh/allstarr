import type { DownloadClientProvider, ImplementationType } from "./types";
import qbittorrentProvider from "./qbittorrent";
import transmissionProvider from "./transmission";
import delugeProvider from "./deluge";
import rtorrentProvider from "./rtorrent";
import sabnzbdProvider from "./sabnzbd";
import nzbgetProvider from "./nzbget";
import blackholeProvider from "./blackhole";

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
