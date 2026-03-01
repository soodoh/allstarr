// oxlint-disable no-console -- Seed script intentionally uses console for output
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL || "data/sqlite.db");
const db = drizzle(sqlite, { schema });

const defaultQualityDefinitions = [
  { title: "Unknown", weight: 1, minSize: 0, maxSize: 0, preferredSize: 0 },
  { title: "PDF", weight: 2, minSize: 0, maxSize: 100, preferredSize: 10 },
  { title: "MOBI", weight: 3, minSize: 0, maxSize: 50, preferredSize: 5 },
  { title: "EPUB", weight: 4, minSize: 0, maxSize: 50, preferredSize: 5 },
  { title: "AZW3", weight: 5, minSize: 0, maxSize: 50, preferredSize: 5 },
  { title: "MP3", weight: 6, minSize: 0, maxSize: 2000, preferredSize: 500 },
  { title: "M4B", weight: 7, minSize: 0, maxSize: 3000, preferredSize: 1000 },
  { title: "FLAC", weight: 8, minSize: 0, maxSize: 5000, preferredSize: 2000 },
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

// Seed quality definitions (idempotent — inserts only missing titles)
const existing = db.select().from(schema.qualityDefinitions).all();
const existingTitles = new Set(existing.map((e) => e.title));
let defsAdded = 0;
for (const def of defaultQualityDefinitions) {
  if (!existingTitles.has(def.title)) {
    db.insert(schema.qualityDefinitions).values(def).run();
    defsAdded += 1;
  }
}
if (defsAdded > 0) {
  console.log(`  Seeded ${defsAdded} quality definition(s)`);
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
