import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL || "sqlite.db");
const db = drizzle(sqlite, { schema });

const defaultQualityDefinitions = [
  { title: "Unknown", weight: 1, minSize: 0, maxSize: 0, preferredSize: 0 },
  { title: "PDF", weight: 2, minSize: 0, maxSize: 100, preferredSize: 10 },
  { title: "MOBI", weight: 3, minSize: 0, maxSize: 50, preferredSize: 5 },
  { title: "EPUB", weight: 4, minSize: 0, maxSize: 50, preferredSize: 5 },
  { title: "AZW3", weight: 5, minSize: 0, maxSize: 50, preferredSize: 5 },
  { title: "Hardcover", weight: 6, minSize: 0, maxSize: 0, preferredSize: 0 },
  { title: "Paperback", weight: 7, minSize: 0, maxSize: 0, preferredSize: 0 },
];

const defaultProfile = {
  name: "Any",
  cutoff: 0,
  items: JSON.stringify([
    { quality: { id: 1, name: "Unknown" }, allowed: true },
    { quality: { id: 2, name: "PDF" }, allowed: true },
    { quality: { id: 3, name: "MOBI" }, allowed: true },
    { quality: { id: 4, name: "EPUB" }, allowed: true },
    { quality: { id: 5, name: "AZW3" }, allowed: true },
  ]),
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
];

async function seed() {
  console.log("Seeding database...");

  // Seed quality definitions
  const existing = db.select().from(schema.qualityDefinitions).all();
  if (existing.length === 0) {
    for (const def of defaultQualityDefinitions) {
      db.insert(schema.qualityDefinitions).values(def).run();
    }
    console.log("  Seeded quality definitions");
  }

  // Seed default quality profile
  const profiles = db.select().from(schema.qualityProfiles).all();
  if (profiles.length === 0) {
    db.insert(schema.qualityProfiles).values(defaultProfile).run();
    console.log("  Seeded default quality profile");
  }

  // Seed default settings
  for (const setting of defaultSettings) {
    db.insert(schema.settings)
      .values(setting)
      .onConflictDoNothing()
      .run();
  }
  console.log("  Seeded default settings");

  console.log("Done!");
}

seed();
