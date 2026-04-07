export type ImageEntityType =
	| "authors"
	| "books"
	| "editions"
	| "movies"
	| "shows"
	| "seasons";

function getExtensionFromContentType(contentType: string): string {
	const map: Record<string, string> = {
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/webp": "webp",
		"image/gif": "gif",
		"image/avif": "avif",
		"image/svg+xml": "svg",
	};
	return map[contentType] || "jpg";
}

async function getImagesDir(): Promise<string> {
	const path = await import("node:path");
	return path.join(
		path.dirname(process.env.DATABASE_URL || "data/sqlite.db"),
		"images",
	);
}

/**
 * Downloads an image from an external URL and saves it locally.
 * Returns the relative path (e.g. "authors/42.jpg") on success, null on failure.
 */
export async function cacheImage(
	url: string,
	type: ImageEntityType,
	id: number,
	suffix?: string,
): Promise<string | null> {
	const fs = await import("node:fs");
	const fsp = await import("node:fs/promises");
	const path = await import("node:path");

	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.warn(
				`[image-cache] Failed to download ${url}: ${response.status}`,
			);
			return null;
		}

		const contentType = response.headers.get("content-type") || "image/jpeg";
		const ext = getExtensionFromContentType(contentType);
		const filename = suffix ? `${id}-${suffix}.${ext}` : `${id}.${ext}`;
		const relativePath = `${type}/${filename}`;
		const imagesDir = await getImagesDir();
		const absolutePath = path.join(imagesDir, relativePath);

		const dir = path.dirname(absolutePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const buffer = await response.arrayBuffer();
		await fsp.writeFile(absolutePath, Buffer.from(buffer));

		return relativePath;
	} catch (error) {
		console.warn(`[image-cache] Error caching image from ${url}:`, error);
		return null;
	}
}

/**
 * Resolves a relative cached image path to an absolute filesystem path.
 */
export async function resolveImagePath(relativePath: string): Promise<string> {
	const path = await import("node:path");
	const imagesDir = await getImagesDir();
	const resolvedPath = path.resolve(imagesDir, relativePath);
	const imagesRoot = path.resolve(imagesDir);
	if (
		resolvedPath !== imagesRoot &&
		!resolvedPath.startsWith(`${imagesRoot}${path.sep}`)
	) {
		throw new Error("Invalid image path");
	}
	return resolvedPath;
}
