import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AudioMeta = {
	duration: number; // seconds
	bitrate: number; // kbps
	sampleRate: number; // Hz
	channels: number;
	codec: string;
};

export type EbookMeta = {
	pageCount: number | null;
	language: string | null;
};

export type VideoMeta = {
	duration: number; // seconds
	codec: string; // "h264", "hevc", "av1", etc.
	container: string; // "mkv", "mp4", etc.
	width: number; // pixels
	height: number; // pixels
	bitrate: number; // kbps
};

// ─── ffprobe availability ───────────────────────────────────────────────────

let probeAvailable: boolean | null = null;

/** Check if ffprobe is available in $PATH. Result is cached for process lifetime. */
function isProbeAvailable(): boolean {
	if (probeAvailable !== null) {
		return probeAvailable;
	}
	try {
		const result = Bun.spawnSync(["ffprobe", "-version"]);
		probeAvailable = result.exitCode === 0;
	} catch {
		// Bun.spawnSync throws when binary is not in $PATH
		probeAvailable = false;
	}
	return probeAvailable;
}

// ─── Audio probing ──────────────────────────────────────────────────────────

/** Extract audio metadata from a file using ffprobe. Returns null if unavailable. */
export async function probeAudioFile(
	filePath: string,
): Promise<AudioMeta | null> {
	if (!isProbeAvailable()) {
		return null;
	}

	try {
		const proc = Bun.spawn([
			"ffprobe",
			"-v",
			"quiet",
			"-print_format",
			"json",
			"-show_format",
			"-show_streams",
			filePath,
		]);
		const output = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return null;
		}

		const data = JSON.parse(output) as {
			format?: { duration?: string; bit_rate?: string };
			streams?: Array<{
				codec_type?: string;
				codec_name?: string;
				sample_rate?: string;
				channels?: number;
			}>;
		};

		const audioStream = data.streams?.find((s) => s.codec_type === "audio");

		return {
			duration: Math.round(Number(data.format?.duration ?? 0)),
			bitrate: Math.round(Number(data.format?.bit_rate ?? 0) / 1000),
			sampleRate: Number(audioStream?.sample_rate ?? 0),
			channels: audioStream?.channels ?? 0,
			codec: audioStream?.codec_name ?? "unknown",
		};
	} catch (error) {
		console.warn(
			`[media-probe] Failed to probe audio "${filePath}": ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		return null;
	}
}

// ─── Video probing ──────────────────────────────────────────────────────────

/** Extract video metadata from a file using ffprobe. Returns null if unavailable. */
export async function probeVideoFile(
	filePath: string,
): Promise<VideoMeta | null> {
	if (!isProbeAvailable()) {
		return null;
	}

	try {
		const proc = Bun.spawn([
			"ffprobe",
			"-v",
			"quiet",
			"-print_format",
			"json",
			"-show_format",
			"-show_streams",
			filePath,
		]);
		const output = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return null;
		}

		const data = JSON.parse(output) as {
			format?: { duration?: string; bit_rate?: string };
			streams?: Array<{
				codec_type?: string;
				codec_name?: string;
				width?: number;
				height?: number;
			}>;
		};

		const videoStream = data.streams?.find((s) => s.codec_type === "video");
		if (!videoStream) {
			return null;
		}

		return {
			duration: Math.round(Number(data.format?.duration ?? 0)),
			bitrate: Math.round(Number(data.format?.bit_rate ?? 0) / 1000),
			codec: videoStream.codec_name ?? "unknown",
			width: videoStream.width ?? 0,
			height: videoStream.height ?? 0,
			container: path.extname(filePath).replace(/^\./, "").toLowerCase(),
		};
	} catch (error) {
		console.warn(
			`[media-probe] Failed to probe video "${filePath}": ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		return null;
	}
}

// ─── Ebook probing ──────────────────────────────────────────────────────────

/** Extract metadata from an EPUB file (ZIP archive with OPF manifest). */
function probeEpub(filePath: string): EbookMeta | null {
	try {
		const zip = new AdmZip(filePath);

		// Find OPF file via container.xml
		const containerEntry = zip.getEntry("META-INF/container.xml");
		if (!containerEntry) {
			return null;
		}
		const containerXml = containerEntry.getData().toString("utf8");

		// Extract rootfile path from container.xml
		const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
		if (!rootfileMatch) {
			return null;
		}

		const opfEntry = zip.getEntry(rootfileMatch[1]);
		if (!opfEntry) {
			return null;
		}
		const opfXml = opfEntry.getData().toString("utf8");

		// Extract language from <dc:language>
		const langMatch = opfXml.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
		const language = langMatch ? langMatch[1].trim() : null;

		// Extract page count from Calibre metadata
		const pageCountMatch = opfXml.match(
			/<meta\s+name="calibre:page_count"\s+content="(\d+)"/i,
		);
		const pageCount = pageCountMatch ? Number(pageCountMatch[1]) : null;

		return { pageCount, language };
	} catch {
		return null;
	}
}

/** Extract page count from a PDF by scanning for /Count in the page tree. Best-effort heuristic. */
function probePdf(filePath: string): EbookMeta | null {
	try {
		// Read first 64KB — page tree root is typically near the start
		const fd = fs.openSync(filePath, "r");
		const buffer = Buffer.alloc(65_536);
		const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
		fs.closeSync(fd);

		const content = buffer.subarray(0, bytesRead).toString("latin1");

		// Look for /Type /Pages ... /Count N pattern
		const countMatch = content.match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/);
		const pageCount = countMatch ? Number(countMatch[1]) : null;

		// PDF language is in the document catalog /Lang entry
		const langMatch = content.match(/\/Lang\s*\(([^)]+)\)/);
		const language = langMatch ? langMatch[1].trim() : null;

		return { pageCount, language };
	} catch {
		return null;
	}
}

/** Extract ebook metadata. Works without ffprobe. Returns null on failure. */
export function probeEbookFile(filePath: string): EbookMeta | null {
	const ext = filePath.toLowerCase();
	if (ext.endsWith(".epub")) {
		return probeEpub(filePath);
	}
	if (ext.endsWith(".pdf")) {
		return probePdf(filePath);
	}
	// MOBI, AZW3, AZW — no lightweight parser available, return null
	return null;
}
