import { createFileRoute } from "@tanstack/react-router";

const MIME_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
	".avif": "image/avif",
	".svg": "image/svg+xml",
};

const OUTPUT_FORMATS = new Set(["webp", "avif", "jpg", "jpeg", "png"]);

async function findImageFile(basePath: string): Promise<string | null> {
	const fs = await import("node:fs");
	const path = await import("node:path");

	if (fs.existsSync(basePath)) {
		return basePath;
	}
	for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]) {
		const candidate = basePath + ext;
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	const dir = path.join(basePath, "..");
	const base = basePath.split("/").pop() ?? "";
	if (fs.existsSync(dir)) {
		const files = fs.readdirSync(dir);
		const match = files.find((f) => f.startsWith(`${base}.`));
		if (match) {
			return path.join(dir, match);
		}
	}
	return null;
}

// biome-ignore lint/suspicious/noExplicitAny: sharp pipeline type requires dynamic import
type SharpPipeline = any;

function applyOutputFormat(
	pipeline: SharpPipeline,
	outputFormat: string,
	quality: number,
): SharpPipeline {
	switch (outputFormat) {
		case "webp": {
			return pipeline.webp({ quality });
		}
		case "avif": {
			return pipeline.avif({ quality });
		}
		case "jpg":
		case "jpeg": {
			return pipeline.jpeg({ quality });
		}
		case "png": {
			return pipeline.png();
		}
		default: {
			return pipeline.webp({ quality });
		}
	}
}

export const Route = createFileRoute("/api/images/$")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				const fsp = await import("node:fs/promises");
				const path = await import("node:path");
				const sharpModule = await import("sharp");
				const sharp = sharpModule.default;
				const { resolveImagePath } = await import("src/server/image-cache");

				const url = new URL(request.url);
				const imagePath = url.pathname.replace(/^\/api\/images\//, "");
				if (!imagePath) {
					return new Response("Not found", { status: 404 });
				}

				const absolutePath = await resolveImagePath(imagePath);
				const filePath = await findImageFile(absolutePath);
				if (!filePath) {
					return new Response("Not found", { status: 404 });
				}

				const w = url.searchParams.get("w");
				const h = url.searchParams.get("h");
				const q = url.searchParams.get("q");
				const format = url.searchParams.get("format");

				const width = w ? Number.parseInt(w, 10) : undefined;
				const height = h ? Number.parseInt(h, 10) : undefined;
				const quality = q ? Number.parseInt(q, 10) : 80;

				const sourceExt = path.extname(filePath).toLowerCase();
				const needsTransform =
					width || height || (format && `.${format}` !== sourceExt);

				if (!needsTransform) {
					const data = await fsp.readFile(filePath);
					const mimeType = MIME_TYPES[sourceExt] || "application/octet-stream";
					return new Response(new Uint8Array(data), {
						headers: {
							"Content-Type": mimeType,
							"Cache-Control": "public, max-age=86400",
						},
					});
				}

				let pipeline = sharp(filePath);

				if (width || height) {
					pipeline = pipeline.resize(width, height, { fit: "cover" });
				}

				const outputFormat =
					format && OUTPUT_FORMATS.has(format) ? format : "webp";
				const outputMime = MIME_TYPES[`.${outputFormat}`] || "image/webp";

				pipeline = applyOutputFormat(pipeline, outputFormat, quality);

				const outputBuffer = await pipeline.toBuffer();
				return new Response(new Uint8Array(outputBuffer), {
					headers: {
						"Content-Type": outputMime,
						"Cache-Control": "public, max-age=86400",
					},
				});
			},
		},
	},
});
