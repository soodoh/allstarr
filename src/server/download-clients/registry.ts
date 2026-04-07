import type { DownloadClientProvider, ImplementationType } from "./types";

export default async function getProvider(
	implementation: string,
): Promise<DownloadClientProvider> {
	if (!import.meta.env.SSR) {
		throw new Error(
			"Download client providers are only available on the server",
		);
	}

	switch (implementation as ImplementationType) {
		case "qBittorrent":
			return (await import("./qbittorrent")).default;
		case "Transmission":
			return (await import("./transmission")).default;
		case "Deluge":
			return (await import("./deluge")).default;
		case "rTorrent":
			return (await import("./rtorrent")).default;
		case "SABnzbd":
			return (await import("./sabnzbd")).default;
		case "NZBGet":
			return (await import("./nzbget")).default;
		case "Blackhole":
			return (await import("./blackhole")).default;
		default:
			throw new Error(
				`Unknown download client implementation: ${implementation}`,
			);
	}
}
