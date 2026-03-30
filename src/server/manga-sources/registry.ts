import { db } from "src/db";
import { mangaSources } from "src/db/schema";
import { eq } from "drizzle-orm";
import type { MangaSource, SourceDefinition } from "./types";

const definitions: SourceDefinition[] = [];
const instances = new Map<string, MangaSource>();

export function registerSource(def: SourceDefinition): void {
  definitions.push(def);
}

export function getAllSourceDefinitions(): SourceDefinition[] {
  return definitions;
}

export function getSource(sourceId: string): MangaSource {
  let instance = instances.get(sourceId);
  if (!instance) {
    const def = definitions.find((d) => d.id === sourceId);
    if (!def) {
      throw new Error(`Unknown manga source: ${sourceId}`);
    }
    instance = def.factory();
    instances.set(sourceId, instance);
  }
  return instance;
}

export function getEnabledSources(): MangaSource[] {
  const enabledRows = db
    .select({ sourceId: mangaSources.sourceId })
    .from(mangaSources)
    .where(eq(mangaSources.enabled, true))
    .all();
  const enabledIds = new Set(enabledRows.map((r) => r.sourceId));
  return definitions
    .filter((d) => enabledIds.has(d.id))
    .map((d) => getSource(d.id));
}

export function getSourceConfig(
  sourceId: string,
): Record<string, unknown> | null {
  const row = db
    .select({ config: mangaSources.config })
    .from(mangaSources)
    .where(eq(mangaSources.sourceId, sourceId))
    .get();
  if (!row?.config) {
    return null;
  }
  return JSON.parse(row.config) as Record<string, unknown>;
}

export function setSourceEnabled(sourceId: string, enabled: boolean): void {
  db.insert(mangaSources)
    .values({ sourceId, enabled, config: null })
    .onConflictDoUpdate({
      target: mangaSources.sourceId,
      set: { enabled },
    })
    .run();
}

export function setSourceConfig(
  sourceId: string,
  config: Record<string, unknown>,
): void {
  db.insert(mangaSources)
    .values({ sourceId, enabled: true, config: JSON.stringify(config) })
    .onConflictDoUpdate({
      target: mangaSources.sourceId,
      set: { config: JSON.stringify(config) },
    })
    .run();
}

/** Seed DB rows for all registered sources (disabled by default). */
export function seedSourcesIfNeeded(): void {
  const existing = db
    .select({ sourceId: mangaSources.sourceId })
    .from(mangaSources)
    .all();
  const existingIds = new Set(existing.map((r) => r.sourceId));

  for (const def of definitions) {
    if (!existingIds.has(def.id)) {
      db.insert(mangaSources)
        .values({ sourceId: def.id, enabled: false, config: null })
        .run();
    }
  }
}
