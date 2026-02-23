import { createServerFn } from "@tanstack/react-start";
import * as fs from "node:fs";
import * as path from "node:path";
import { requireAuth } from "./middleware";
import { browseDirectorySchema } from "~/lib/validators";

type DirectoryEntry = {
  name: string;
  path: string;
};

type BrowseDirectoryResult = {
  current: string;
  parent: string | undefined;
  directories: DirectoryEntry[];
};

export default createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => browseDirectorySchema.parse(d))
  .handler(async ({ data }): Promise<BrowseDirectoryResult> => {
    await requireAuth();

    const current = data.path;
    const parsed = path.parse(current);
    const parent = parsed.dir === current ? undefined : parsed.dir;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    const directories: DirectoryEntry[] = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({
        name: entry.name,
        path: path.join(current, entry.name),
      }));

    return { current, parent, directories };
  });
