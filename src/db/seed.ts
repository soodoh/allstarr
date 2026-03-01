// oxlint-disable no-console -- Seed script intentionally uses console for output
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL || "data/sqlite.db");
const db = drizzle(sqlite, { schema });

const defaultQualityDefinitions = [
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

const defaultProfile = {
  name: "Any",
  cutoff: 0,
  items: [
    { quality: { id: 4, name: "EPUB" }, allowed: true },
    { quality: { id: 8, name: "FLAC" }, allowed: true },
    { quality: { id: 5, name: "AZW3" }, allowed: true },
    { quality: { id: 7, name: "M4B" }, allowed: true },
    { quality: { id: 3, name: "MOBI" }, allowed: true },
    { quality: { id: 2, name: "PDF" }, allowed: true },
    { quality: { id: 6, name: "MP3" }, allowed: true },
    { quality: { id: 1, name: "Unknown" }, allowed: true },
  ],
  upgradeAllowed: false,
};

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

// Seed default quality profile
const profiles = db.select().from(schema.qualityProfiles).all();
if (profiles.length === 0) {
  db.insert(schema.qualityProfiles).values(defaultProfile).run();
  console.log("  Seeded default quality profile");
}

// Seed default settings
for (const setting of defaultSettings) {
  db.insert(schema.settings).values(setting).onConflictDoNothing().run();
}
console.log("  Seeded default settings");

console.log("Done!");
