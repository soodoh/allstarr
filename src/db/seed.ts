// oxlint-disable no-console -- Seed script intentionally uses console for output
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
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

const defaultProfiles = [
  {
    name: "Ebook",
    rootFolderPath: "/books",
    cutoff: 0,
    icon: "book-marked",
    items: [4, 5, 3, 2],
    upgradeAllowed: false,
    categories: [7020, 8010],
  },
  {
    name: "Audiobook",
    rootFolderPath: "/books",
    cutoff: 0,
    icon: "audio-lines",
    items: [6, 7, 8],
    upgradeAllowed: false,
    categories: [3030],
  },
];

const defaultSettings = [
  { key: "naming.authorFolder", value: JSON.stringify("{Author Name}") },
  {
    key: "naming.bookFolder",
    value: JSON.stringify("{Book Title} ({Release Year})"),
  },
  {
    key: "naming.bookFile",
    value: JSON.stringify("{Author Name} - {Book Title}"),
  },
  { key: "general.logLevel", value: JSON.stringify("info") },
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

const defaultTasks = [
  { id: "rss-sync", name: "RSS Sync", interval: 15 * 60 },
  { id: "refresh-metadata", name: "Refresh Metadata", interval: 12 * 60 * 60 },
  { id: "check-health", name: "Check Health", interval: 25 * 60 },
  { id: "housekeeping", name: "Housekeeping", interval: 24 * 60 * 60 },
  { id: "backup", name: "Backup Database", interval: 7 * 24 * 60 * 60 },
  { id: "rescan-folders", name: "Rescan Folders", interval: 6 * 60 * 60 },
  { id: "refresh-downloads", name: "Refresh Downloads", interval: 60 },
];

console.log("Seeding database...");

for (const def of defaultQualityDefinitions) {
  db.insert(schema.qualityDefinitions).values(def).onConflictDoNothing().run();
}
console.log(
  `  Seeded ${defaultQualityDefinitions.length} quality definition(s)`,
);

for (const profile of defaultProfiles) {
  db.insert(schema.qualityProfiles).values(profile).onConflictDoNothing().run();
}
console.log(`  Seeded ${defaultProfiles.length} quality profile(s)`);

for (const task of defaultTasks) {
  db.insert(schema.scheduledTasks)
    .values({ ...task, enabled: true })
    .onConflictDoNothing()
    .run();
}
console.log(`  Seeded ${defaultTasks.length} scheduled task(s)`);

for (const setting of defaultSettings) {
  db.insert(schema.settings).values(setting).onConflictDoNothing().run();
}
console.log(`  Seeded ${defaultSettings.length} default setting(s)`);

console.log("Done!");
