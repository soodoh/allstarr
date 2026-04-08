import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATE_FILE = join(import.meta.dirname, ".test-state.json");
const TEMPLATE_DB_PATH = join(
  import.meta.dirname,
  "..",
  "data",
  "test-template.db",
);

async function globalTeardown(): Promise<void> {
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
  if (existsSync(TEMPLATE_DB_PATH)) {
    unlinkSync(TEMPLATE_DB_PATH);
  }
}

export default globalTeardown;
