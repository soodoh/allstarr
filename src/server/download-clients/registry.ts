import type { DownloadClientProvider, ImplementationType } from "./types";

const providerLoaders: Record<
	ImplementationType,
	() => Promise<{ default: DownloadClientProvider }>
> = {
	qBittorrent: () => import("./qbittorrent"),
	Transmission: () => import("./transmission"),
	Deluge: () => import("./deluge"),
	rTorrent: () => import("./rtorrent"),
	SABnzbd: () => import("./sabnzbd"),
	NZBGet: () => import("./nzbget"),
	Blackhole: () => import("./blackhole"),
};

export default async function getProvider(
	implementation: string,
): Promise<DownloadClientProvider> {
	const loader = providerLoaders[implementation as ImplementationType];
	if (!loader) {
		throw new Error(
			`Unknown download client implementation: ${implementation}`,
		);
	}

	const { default: provider } = await loader();
	return provider;
}
