import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./middleware";
import { browseDirectorySchema } from "src/lib/validators";

type DirectoryEntry = {
  name: string;
  path: string;
};

type BrowseDirectoryResult = {
  current: string;
  parent: string | undefined;
  directories: DirectoryEntry[];
};

// eslint-disable-next-line import/prefer-default-export
export const browseDirectoryFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => browseDirectorySchema.parse(d))
  .handler(async ({ data }): Promise<BrowseDirectoryResult> => {
    const fs = await import("node:fs");

    await requireAuth();

    const current = data.path;

    // Compute parent by stripping the last path segment (avoids node:path on client)
    const normalized =
      current.endsWith("/") && current !== "/" ? current.slice(0, -1) : current;
    const lastSlash = normalized.lastIndexOf("/");
    const parentRaw = lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash);
    const parent = parentRaw === current ? undefined : parentRaw;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    const directories: DirectoryEntry[] = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({
        name: entry.name,
        path: `${normalized}/${entry.name}`,
      }));

    return { current, parent, directories };
  });
