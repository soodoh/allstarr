import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { timeDiagnosticOperation } from "./helpers/diagnostics";

const STATE_FILE = join(import.meta.dirname, ".test-state.json");
const TEMPLATE_DB_PATH = join(
  import.meta.dirname,
  "..",
  "data",
  "test-template.db",
);

async function globalTeardown(): Promise<void> {
  await timeDiagnosticOperation(
    {
      scope: "global-teardown",
      event: "remove-state-file",
      fields: { path: STATE_FILE, existed: existsSync(STATE_FILE) },
    },
    async () => {
      if (existsSync(STATE_FILE)) {
        unlinkSync(STATE_FILE);
      }
    },
  );

  await timeDiagnosticOperation(
    {
      scope: "global-teardown",
      event: "remove-template-db",
      fields: { path: TEMPLATE_DB_PATH, existed: existsSync(TEMPLATE_DB_PATH) },
    },
    async () => {
      if (existsSync(TEMPLATE_DB_PATH)) {
        unlinkSync(TEMPLATE_DB_PATH);
      }
    },
  );
}

export default globalTeardown;
