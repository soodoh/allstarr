import { db } from "src/db";
import { settings } from "src/db/schema";
import { eq } from "drizzle-orm";

export default function getMediaSetting<T>(key: string, defaultValue: T): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row?.value) {
    return defaultValue;
  }
  try {
    const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    return v as T;
  } catch {
    return defaultValue;
  }
}
