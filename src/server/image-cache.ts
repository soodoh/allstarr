async function getImagesDir(): Promise<string> {
	const path = await import("node:path");
	return path.join(
		path.dirname(process.env.DATABASE_URL || "data/sqlite.db"),
		"images",
	);
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
