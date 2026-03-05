// oxlint-disable no-console -- Seed script intentionally uses console for output
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type { QualitySpecification } from "./schema/quality-definitions";

const sqlite = new Database(process.env.DATABASE_URL || "data/sqlite.db");
const db = drizzle({ client: sqlite, schema });

const defaultQualityDefinitions: Array<{
  title: string;
  weight: number;
  minSize: number;
  maxSize: number;
  preferredSize: number;
  color: string;
  specifications: QualitySpecification[];
}> = [
  {
    title: "Unknown",
    weight: 1,
    minSize: 0,
    maxSize: 0,
    preferredSize: 0,
    color: "gray",
    specifications: [],
  },
  {
    title: "PDF",
    weight: 2,
    minSize: 0,
    maxSize: 100,
    preferredSize: 10,
    color: "yellow",
    specifications: [
      {
        type: "releaseTitle",
        value: "\\bpdf\\b",
        negate: false,
        required: true,
      },
    ],
  },
  {
    title: "MOBI",
    weight: 3,
    minSize: 0,
    maxSize: 50,
    preferredSize: 5,
    color: "amber",
    specifications: [
      {
        type: "releaseTitle",
        value: "\\bmobi\\b",
        negate: false,
        required: true,
      },
    ],
  },
  {
    title: "EPUB",
    weight: 4,
    minSize: 0,
    maxSize: 50,
    preferredSize: 5,
    color: "green",
    specifications: [
      {
        type: "releaseTitle",
        value: "\\bepub\\b",
        negate: false,
        required: true,
      },
    ],
  },
  {
    title: "AZW3",
    weight: 5,
    minSize: 0,
    maxSize: 50,
    preferredSize: 5,
    color: "blue",
    specifications: [
      {
        type: "releaseTitle",
        value: "\\bazw3?\\b",
        negate: false,
        required: true,
      },
    ],
  },
  {
    title: "MP3",
    weight: 6,
    minSize: 0,
    maxSize: 2000,
    preferredSize: 500,
    color: "orange",
    specifications: [
      {
        type: "releaseTitle",
        value: "\\bmp3\\b",
        negate: false,
        required: true,
      },
    ],
  },
  {
    title: "M4B",
    weight: 7,
    minSize: 0,
    maxSize: 3000,
    preferredSize: 1000,
    color: "cyan",
    specifications: [
      {
        type: "releaseTitle",
        value: "\\bm4b\\b",
        negate: false,
        required: true,
      },
    ],
  },
  {
    title: "FLAC",
    weight: 8,
    minSize: 0,
    maxSize: 5000,
    preferredSize: 2000,
    color: "purple",
    specifications: [
      {
        type: "releaseTitle",
        value: "\\bflac\\b",
        negate: false,
        required: true,
      },
    ],
  },
];

const defaultRootFolder = "/books";

const defaultProfiles = [
  {
    name: "Ebook",
    rootFolderPath: defaultRootFolder,
    cutoff: 0,
    icon: "book-marked",
    items: [4, 5, 3, 2],
    upgradeAllowed: false,
    categories: [7020, 8010],
  },
  {
    name: "Audiobook",
    rootFolderPath: defaultRootFolder,
    cutoff: 0,
    icon: "audio-lines",
    items: [6, 7, 8],
    upgradeAllowed: false,
    categories: [3030],
  },
];

const defaultSettings = [
  {
    key: "naming.authorFolder",
    value: JSON.stringify("{Author Name}"),
  },
  {
    key: "naming.bookFolder",
    value: JSON.stringify("{Book Title} ({Release Year})"),
  },
  {
    key: "naming.bookFile",
    value: JSON.stringify("{Author Name} - {Book Title}"),
  },
  {
    key: "general.logLevel",
    value: JSON.stringify("info"),
  },
  {
    key: "general.apiKey",
    value: JSON.stringify(crypto.randomUUID()),
  },
  {
    key: "metadata.profile",
    value: JSON.stringify({
      allowedLanguages: ["en"],
      skipMissingReleaseDate: false,
      skipMissingIsbnAsin: false,
      skipCompilations: true,
    }),
  },
];

console.log("Seeding database...");

// Seed quality definitions (idempotent — inserts missing, backfills color/specs)
const existing = db.select().from(schema.qualityDefinitions).all();
const existingByTitle = new Map(existing.map((e) => [e.title, e]));
let defsAdded = 0;
let defsUpdated = 0;
for (const def of defaultQualityDefinitions) {
  const row = existingByTitle.get(def.title);
  if (row) {
    // Backfill color/specs for existing rows that lack them
    const specs = Array.isArray(row.specifications)
      ? row.specifications
      : JSON.parse((row.specifications as string) || "[]");
    if (
      (row.color === "gray" && def.color !== "gray") ||
      (specs.length === 0 && def.specifications.length > 0)
    ) {
      db.update(schema.qualityDefinitions)
        .set({ color: def.color, specifications: def.specifications })
        .where(eq(schema.qualityDefinitions.id, row.id))
        .run();
      defsUpdated += 1;
    }
  } else {
    db.insert(schema.qualityDefinitions).values(def).run();
    defsAdded += 1;
  }
}
if (defsAdded > 0) {
  console.log(`  Seeded ${defsAdded} quality definition(s)`);
}
if (defsUpdated > 0) {
  console.log(
    `  Updated ${defsUpdated} quality definition(s) with colors/specs`,
  );
}

// Seed default quality profiles
const profiles = db.select().from(schema.qualityProfiles).all();
if (profiles.length === 0) {
  for (const profile of defaultProfiles) {
    db.insert(schema.qualityProfiles).values(profile).run();
  }
  console.log(`  Seeded ${defaultProfiles.length} default quality profile(s)`);
}

// Backfill root folder path, icons, and categories on existing profiles
const profileBackfill: Record<string, { icon: string; categories: number[] }> =
  {
    Ebook: { icon: "book-marked", categories: [7020, 8010] },
    Audiobook: { icon: "audio-lines", categories: [3030] },
  };
let profilesBackfilled = 0;
const allProfiles = db.select().from(schema.qualityProfiles).all();
for (const profile of allProfiles) {
  const updates: {
    icon?: string;
    rootFolderPath?: string;
    categories?: number[];
  } = {};
  const backfill = profileBackfill[profile.name];
  if (backfill && profile.icon !== backfill.icon) {
    updates.icon = backfill.icon;
  }
  if (!profile.rootFolderPath) {
    updates.rootFolderPath = defaultRootFolder;
  }
  if (
    backfill &&
    (!profile.categories ||
      (Array.isArray(profile.categories) && profile.categories.length === 0))
  ) {
    updates.categories = backfill.categories;
  }
  if (Object.keys(updates).length > 0) {
    db.update(schema.qualityProfiles)
      .set(updates)
      .where(eq(schema.qualityProfiles.id, profile.id))
      .run();
    profilesBackfilled += 1;
  }
}
if (profilesBackfilled > 0) {
  console.log(`  Backfilled ${profilesBackfilled} profile(s)`);
}

// Migrate old-format profile items (object array → ID array)
let profilesMigrated = 0;
const profilesToMigrate = db.select().from(schema.qualityProfiles).all();
for (const profile of profilesToMigrate) {
  const raw = profile.items;
  if (!Array.isArray(raw) || raw.length === 0) {
    continue;
  }
  // Detect old format: items are objects with {quality: {id}, allowed}
  if (typeof raw[0] === "object" && raw[0] !== null && "quality" in raw[0]) {
    const migrated = (
      raw as Array<{ quality: { id: number }; allowed: boolean }>
    )
      .filter((i) => i.allowed)
      .map((i) => i.quality.id);
    db.update(schema.qualityProfiles)
      .set({ items: migrated })
      .where(eq(schema.qualityProfiles.id, profile.id))
      .run();
    profilesMigrated += 1;
  }
}
if (profilesMigrated > 0) {
  console.log(`  Migrated ${profilesMigrated} profile(s) to new items format`);
}

// Seed scheduled tasks
const defaultTasks = [
  { id: "rss-sync", name: "RSS Sync", interval: 15 * 60 },
  { id: "refresh-metadata", name: "Refresh Metadata", interval: 12 * 60 * 60 },
  { id: "check-health", name: "Check Health", interval: 25 * 60 },
  { id: "housekeeping", name: "Housekeeping", interval: 24 * 60 * 60 },
  { id: "backup", name: "Backup Database", interval: 7 * 24 * 60 * 60 },
  { id: "rescan-folders", name: "Rescan Folders", interval: 6 * 60 * 60 },
  { id: "refresh-downloads", name: "Refresh Downloads", interval: 60 },
];

let tasksSeeded = 0;
for (const task of defaultTasks) {
  db.insert(schema.scheduledTasks)
    .values({ ...task, enabled: true })
    .onConflictDoNothing()
    .run();
  tasksSeeded += 1;
}
console.log(`  Seeded ${tasksSeeded} scheduled task(s)`);

// Seed default settings
for (const setting of defaultSettings) {
  db.insert(schema.settings).values(setting).onConflictDoNothing().run();
}
console.log("  Seeded default settings");

// Backfill NULL array columns with empty arrays
const nullFixQueries = [
  `UPDATE authors SET images = '[]' WHERE images IS NULL`,
  `UPDATE authors SET tags = '[]' WHERE tags IS NULL`,
  `UPDATE books SET images = '[]' WHERE images IS NULL`,
  `UPDATE books SET tags = '[]' WHERE tags IS NULL`,
  `UPDATE editions SET images = '[]' WHERE images IS NULL`,
  `UPDATE editions SET contributors = '[]' WHERE contributors IS NULL`,
];
for (const query of nullFixQueries) {
  sqlite.run(query);
}
console.log("  Backfilled NULL array columns with empty arrays");

console.log("Done!");
