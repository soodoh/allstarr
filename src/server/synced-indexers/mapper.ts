import type { SyncedIndexer, NewSyncedIndexer } from "src/db/schema";

export type ReadarrField = {
  name: string;
  value: unknown;
};

export type ReadarrIndexerResource = {
  id?: number;
  name: string;
  implementation: string;
  implementationName?: string;
  configContract: string;
  infoLink?: string;
  fields: ReadarrField[];
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  supportsRss?: boolean;
  supportsSearch?: boolean;
  protocol: string;
  priority: number;
  tags?: number[];
};

/**
 * Converts a DB row to a Readarr-style indexer resource that Prowlarr expects.
 */
export function toReadarrResource(row: SyncedIndexer): ReadarrIndexerResource {
  const categories = (() => {
    try {
      return JSON.parse(row.categories ?? "[]") as number[];
    } catch {
      return [];
    }
  })();

  return {
    id: row.id,
    name: row.name,
    implementation: row.implementation,
    implementationName: row.implementation,
    configContract: row.configContract,
    infoLink: "",
    fields: [
      { name: "baseUrl", value: row.baseUrl },
      { name: "apiPath", value: row.apiPath ?? "/api" },
      { name: "apiKey", value: row.apiKey ?? "" },
      { name: "categories", value: categories },
    ],
    enableRss: row.enableRss,
    enableAutomaticSearch: row.enableAutomaticSearch,
    enableInteractiveSearch: row.enableInteractiveSearch,
    supportsRss: true,
    supportsSearch: true,
    protocol: row.protocol,
    priority: row.priority,
    tags: [],
  };
}

/**
 * Converts a Readarr-style indexer resource from Prowlarr into a DB insert/update shape.
 */
export function fromReadarrResource(
  body: ReadarrIndexerResource,
): Omit<NewSyncedIndexer, "id" | "createdAt" | "updatedAt"> {
  const getField = (name: string): unknown =>
    body.fields?.find((f) => f.name === name)?.value;

  const categories = (() => {
    const raw = getField("categories");
    if (Array.isArray(raw)) {
      return JSON.stringify(raw);
    }
    return "[]";
  })();

  return {
    name: body.name,
    implementation: body.implementation,
    configContract: body.configContract,
    baseUrl: (getField("baseUrl") as string) ?? "",
    apiPath: (getField("apiPath") as string) ?? "/api",
    apiKey: (getField("apiKey") as string) ?? null,
    categories,
    enableRss: body.enableRss ?? true,
    enableSearch: body.enableAutomaticSearch ?? true,
    enableAutomaticSearch: body.enableAutomaticSearch ?? true,
    enableInteractiveSearch: body.enableInteractiveSearch ?? true,
    priority: body.priority ?? 25,
    // Prowlarr doesn't always send protocol at top level — infer from implementation
    protocol:
      body.protocol ??
      (body.implementation === "Torznab" ? "torrent" : "usenet"),
  };
}
