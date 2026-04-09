import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Shared mocks (hoisted above all imports) ──────────────────────────────

const mocks = vi.hoisted(() => ({
	spawnSync: vi.fn(),
	spawn: vi.fn(),
	logWarn: vi.fn(),
	admZipInstance: {
		getEntry: vi.fn(),
	},
	fsOpenSync: vi.fn(),
	fsReadSync: vi.fn(),
	fsCloseSync: vi.fn(),
}));

vi.stubGlobal("Bun", {
	spawnSync: mocks.spawnSync,
	spawn: mocks.spawn,
});

vi.mock("node:fs", () => ({
	default: {
		openSync: mocks.fsOpenSync,
		readSync: mocks.fsReadSync,
		closeSync: mocks.fsCloseSync,
	},
}));
vi.mock("node:path", () => ({
	default: {
		extname: vi.fn((p: string) => {
			const dot = p.lastIndexOf(".");
			return dot >= 0 ? p.slice(dot) : "";
		}),
	},
}));
vi.mock("adm-zip", () => {
	const AdmZipMock = vi.fn();
	AdmZipMock.prototype = mocks.admZipInstance;
	return { default: AdmZipMock };
});
vi.mock("../logger", () => ({ logWarn: mocks.logWarn }));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSpawnResult(
	output: object,
	exitCode = 0,
): { stdout: ReadableStream; exited: Promise<number> } {
	const text = JSON.stringify(output);
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
	return { stdout: stream, exited: Promise.resolve(exitCode) };
}

function makeZipEntry(content: string) {
	return {
		getData: () => Buffer.from(content, "utf8"),
	};
}

// ─── Audio probing ─────────────────────────────────────────────────────────

describe("probeAudioFile", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("returns null when ffprobe is unavailable", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 1 });

		const { probeAudioFile } = await import("../media-probe");
		const result = await probeAudioFile("/path/to/audio.mp3");

		expect(result).toBeNull();
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("returns null when ffprobe binary throws", async () => {
		mocks.spawnSync.mockImplementation(() => {
			throw new Error("not found");
		});

		const { probeAudioFile } = await import("../media-probe");
		const result = await probeAudioFile("/path/to/audio.mp3");

		expect(result).toBeNull();
	});

	it("parses ffprobe JSON output correctly", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });

		const ffprobeOutput = {
			format: { duration: "312.5", bit_rate: "320000" },
			streams: [
				{
					codec_type: "audio",
					codec_name: "mp3",
					sample_rate: "44100",
					channels: 2,
				},
			],
		};
		mocks.spawn.mockReturnValue(makeSpawnResult(ffprobeOutput));

		const { probeAudioFile } = await import("../media-probe");
		const result = await probeAudioFile("/path/to/song.mp3");

		expect(result).toStrictEqual({
			duration: 313,
			bitrate: 320,
			sampleRate: 44100,
			channels: 2,
			codec: "mp3",
		});
	});

	it("returns null when ffprobe exits with non-zero code", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });
		mocks.spawn.mockReturnValue(makeSpawnResult({}, 1));

		const { probeAudioFile } = await import("../media-probe");
		const result = await probeAudioFile("/path/to/bad.mp3");

		expect(result).toBeNull();
	});

	it("handles missing audio stream gracefully", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });

		const ffprobeOutput = {
			format: { duration: "60.0", bit_rate: "128000" },
			streams: [{ codec_type: "video", codec_name: "h264" }],
		};
		mocks.spawn.mockReturnValue(makeSpawnResult(ffprobeOutput));

		const { probeAudioFile } = await import("../media-probe");
		const result = await probeAudioFile("/path/to/video-only.mkv");

		expect(result).toStrictEqual({
			duration: 60,
			bitrate: 128,
			sampleRate: 0,
			channels: 0,
			codec: "unknown",
		});
	});

	it("logs warning and returns null on parse error", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });
		// spawn returns something that causes JSON.parse to throw
		const badStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("not-json"));
				controller.close();
			},
		});
		mocks.spawn.mockReturnValue({
			stdout: badStream,
			exited: Promise.resolve(0),
		});

		const { probeAudioFile } = await import("../media-probe");
		const result = await probeAudioFile("/path/to/corrupt.mp3");

		expect(result).toBeNull();
		expect(mocks.logWarn).toHaveBeenCalledWith(
			"media-probe",
			expect.stringContaining("Failed to probe audio"),
		);
	});
});

// ─── Video probing ─────────────────────────────────────────────────────────

describe("probeVideoFile", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("returns null when ffprobe is unavailable", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 1 });

		const { probeVideoFile } = await import("../media-probe");
		const result = await probeVideoFile("/path/to/video.mkv");

		expect(result).toBeNull();
	});

	it("returns null when no video stream is found", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });

		const ffprobeOutput = {
			format: { duration: "200.0", bit_rate: "128000" },
			streams: [
				{
					codec_type: "audio",
					codec_name: "aac",
					sample_rate: "48000",
					channels: 2,
				},
			],
		};
		mocks.spawn.mockReturnValue(makeSpawnResult(ffprobeOutput));

		const { probeVideoFile } = await import("../media-probe");
		const result = await probeVideoFile("/path/to/audio-only.mp4");

		expect(result).toBeNull();
	});

	it("parses ffprobe JSON output correctly", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });

		const ffprobeOutput = {
			format: { duration: "7200.5", bit_rate: "5000000" },
			streams: [
				{
					codec_type: "video",
					codec_name: "h264",
					width: 1920,
					height: 1080,
				},
				{
					codec_type: "audio",
					codec_name: "aac",
				},
			],
		};
		mocks.spawn.mockReturnValue(makeSpawnResult(ffprobeOutput));

		const { probeVideoFile } = await import("../media-probe");
		const result = await probeVideoFile("/path/to/movie.mkv");

		expect(result).toStrictEqual({
			duration: 7201,
			bitrate: 5000,
			codec: "h264",
			width: 1920,
			height: 1080,
			container: "mkv",
		});
	});

	it("logs warning and returns null on error", async () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });
		const badStream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("{invalid"));
				controller.close();
			},
		});
		mocks.spawn.mockReturnValue({
			stdout: badStream,
			exited: Promise.resolve(0),
		});

		const { probeVideoFile } = await import("../media-probe");
		const result = await probeVideoFile("/path/to/corrupt.mp4");

		expect(result).toBeNull();
		expect(mocks.logWarn).toHaveBeenCalledWith(
			"media-probe",
			expect.stringContaining("Failed to probe video"),
		);
	});
});

// ─── Ebook probing ─────────────────────────────────────────────────────────

describe("probeEbookFile", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	describe("EPUB files", () => {
		it("extracts language and page count from OPF metadata", async () => {
			const containerXml =
				'<?xml version="1.0"?><container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>';
			const opfXml = `<?xml version="1.0"?>
				<package>
					<metadata>
						<dc:language>en</dc:language>
						<meta name="calibre:page_count" content="342"/>
					</metadata>
				</package>`;

			mocks.admZipInstance.getEntry.mockImplementation((name: string) => {
				if (name === "META-INF/container.xml")
					return makeZipEntry(containerXml);
				if (name === "content.opf") return makeZipEntry(opfXml);
				return null;
			});

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/novel.epub");

			expect(result).toStrictEqual({
				pageCount: 342,
				language: "en",
			});
		});

		it("returns null language and pageCount when OPF lacks them", async () => {
			const containerXml =
				'<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>';
			const opfXml = "<package><metadata></metadata></package>";

			mocks.admZipInstance.getEntry.mockImplementation((name: string) => {
				if (name === "META-INF/container.xml")
					return makeZipEntry(containerXml);
				if (name === "content.opf") return makeZipEntry(opfXml);
				return null;
			});

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/minimal.epub");

			expect(result).toStrictEqual({
				pageCount: null,
				language: null,
			});
		});

		it("returns null when container.xml is missing", async () => {
			mocks.admZipInstance.getEntry.mockReturnValue(null);

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/broken.epub");

			expect(result).toBeNull();
		});

		it("returns null when rootfile path is missing from container.xml", async () => {
			const containerXml =
				"<container><rootfiles><rootfile/></rootfiles></container>";

			mocks.admZipInstance.getEntry.mockImplementation((name: string) => {
				if (name === "META-INF/container.xml")
					return makeZipEntry(containerXml);
				return null;
			});

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/bad-container.epub");

			expect(result).toBeNull();
		});

		it("returns null when OPF entry is missing", async () => {
			const containerXml =
				'<container><rootfiles><rootfile full-path="missing.opf"/></rootfiles></container>';

			mocks.admZipInstance.getEntry.mockImplementation((name: string) => {
				if (name === "META-INF/container.xml")
					return makeZipEntry(containerXml);
				return null;
			});

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/missing-opf.epub");

			expect(result).toBeNull();
		});
	});

	describe("PDF files", () => {
		it("extracts page count and language from PDF header", async () => {
			const pdfContent =
				"%PDF-1.4\n/Type /Pages /Count 256\n/Lang (en-US)\nendobj";
			const pdfBuffer = Buffer.from(pdfContent, "latin1");

			mocks.fsOpenSync.mockReturnValue(42);
			mocks.fsReadSync.mockImplementation(
				(
					_fd: number,
					buf: Buffer,
					_offset: number,
					length: number,
					_pos: number,
				) => {
					pdfBuffer.copy(buf, 0, 0, Math.min(length, pdfBuffer.length));
					return Math.min(length, pdfBuffer.length);
				},
			);
			mocks.fsCloseSync.mockReturnValue(undefined);

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/document.pdf");

			expect(result).toStrictEqual({
				pageCount: 256,
				language: "en-US",
			});
			expect(mocks.fsCloseSync).toHaveBeenCalledWith(42);
		});

		it("returns nulls when PDF lacks page tree and language", async () => {
			const pdfContent = "%PDF-1.4\nsome random content\nendobj";
			const pdfBuffer = Buffer.from(pdfContent, "latin1");

			mocks.fsOpenSync.mockReturnValue(10);
			mocks.fsReadSync.mockImplementation(
				(
					_fd: number,
					buf: Buffer,
					_offset: number,
					length: number,
					_pos: number,
				) => {
					pdfBuffer.copy(buf, 0, 0, Math.min(length, pdfBuffer.length));
					return Math.min(length, pdfBuffer.length);
				},
			);
			mocks.fsCloseSync.mockReturnValue(undefined);

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/no-meta.pdf");

			expect(result).toStrictEqual({
				pageCount: null,
				language: null,
			});
		});

		it("returns null when fs operations throw", async () => {
			mocks.fsOpenSync.mockImplementation(() => {
				throw new Error("ENOENT");
			});

			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/missing.pdf");

			expect(result).toBeNull();
		});
	});

	describe("unsupported formats", () => {
		it("returns null for .mobi files", async () => {
			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/novel.mobi");

			expect(result).toBeNull();
		});

		it("returns null for .azw3 files", async () => {
			const { probeEbookFile } = await import("../media-probe");
			const result = probeEbookFile("/books/kindle.azw3");

			expect(result).toBeNull();
		});
	});
});
