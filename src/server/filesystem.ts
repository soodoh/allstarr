import type { Dirent } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { browseDirectorySchema } from "src/lib/validators";
import { requireAdmin } from "./middleware";

type DirectoryEntry = {
	name: string;
	path: string;
};

type BrowseDirectoryResult = {
	current: string;
	parent: string | null;
	directories: DirectoryEntry[];
};

export const getServerCwdFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();
		return process.cwd();
	},
);

export const browseDirectoryFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => browseDirectorySchema.parse(d))
	.handler(async ({ data }): Promise<BrowseDirectoryResult> => {
		const fs = await import("node:fs");

		await requireAdmin();

		const current = fs.existsSync(data.path) ? data.path : process.cwd();

		// Compute parent by stripping the last path segment (avoids node:path on client)
		const normalized =
			current.endsWith("/") && current !== "/" ? current.slice(0, -1) : current;
		const lastSlash = normalized.lastIndexOf("/");
		const parentRaw = lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash);
		const parent = parentRaw === current ? null : parentRaw;

		const entries = fs.readdirSync(current, { withFileTypes: true });
		const isDir = (entry: Dirent) => {
			if (entry.isDirectory()) {
				return true;
			}
			if (entry.isSymbolicLink()) {
				try {
					const target = fs.statSync(
						normalized === "/"
							? `/${entry.name}`
							: `${normalized}/${entry.name}`,
					);
					return target.isDirectory();
				} catch {
					return false;
				}
			}
			return false;
		};
		const directories: DirectoryEntry[] = entries
			.filter(
				(entry) =>
					isDir(entry) && (data.showHidden || !entry.name.startsWith(".")),
			)
			.toSorted((a, b) => a.name.localeCompare(b.name))
			.map((entry) => ({
				name: entry.name,
				path:
					normalized === "/" ? `/${entry.name}` : `${normalized}/${entry.name}`,
			}));

		return { current, parent, directories };
	});
