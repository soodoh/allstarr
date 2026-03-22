import { copyFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STATE_FILE = join(import.meta.dirname, "..", ".test-state.json");

export type TestDbHandle = {
  dbPath: string;
  cleanup: () => void;
};

export function getTestState(): {
  templateDbPath: string;
  servers: Record<string, string>;
} {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export function createTestDb(suiteId: string): TestDbHandle {
  const { templateDbPath } = getTestState();
  const dbPath = join(
    import.meta.dirname,
    "..",
    "..",
    "data",
    `test-${suiteId}-${Date.now()}.db`,
  );
  copyFileSync(templateDbPath, dbPath);

  return {
    dbPath,
    cleanup: () => {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    },
  };
}
