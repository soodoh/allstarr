import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import {
	redactDiagnosticValue,
	timeDiagnosticOperation,
} from "./helpers/diagnostics";
import PORTS from "./ports";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const TEMPLATE_DB_PATH = join(PROJECT_ROOT, "data", "test-template.db");
const STATE_FILE = join(import.meta.dirname, ".test-state.json");

type ExecFileSyncError = Error & {
	status?: number | null;
	stdout?: Buffer | string;
	stderr?: Buffer | string;
};

function outputSnippet(output: unknown): string | undefined {
	if (output == null) {
		return undefined;
	}
	const text = Buffer.isBuffer(output) ? output.toString("utf8") : String(output);
	return redactDiagnosticValue("output", text) || undefined;
}

function dbPushError(error: unknown): Error {
	if (!(error instanceof Error)) {
		return new Error(String(error));
	}
	const execError = error as ExecFileSyncError;
	const stdout = outputSnippet(execError.stdout);
	const stderr = outputSnippet(execError.stderr);
	const details = [
		"db:push failed",
		typeof execError.status === "number" ? `status=${execError.status}` : undefined,
		stdout ? `stdout=${stdout}` : undefined,
		stderr ? `stderr=${stderr}` : undefined,
	]
		.filter(Boolean)
		.join(" ");
	return new Error(details, { cause: error });
}

async function killPortListeners(): Promise<{
  scannedPorts: number;
  killedProcesses: number;
}> {
  // Include app server ports (19100+) in cleanup to kill leftover dev servers
  const ports: number[] = [...Object.values(PORTS)];
  let killedProcesses = 0;
  // Also clean up potential worker ports (19100-19106)
  for (let i = 0; i < 7; i += 1) {
    ports.push(PORTS.APP_BASE + i);
  }
  for (const port of ports) {
    try {
      const { execFileSync: efs } = await import("node:child_process");
      const pids = efs("lsof", ["-ti", `:${String(port)}`], {
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), "SIGKILL");
          killedProcesses += 1;
        } catch {
          // Process may already be gone
        }
      }
    } catch {
      // No listeners on this port
    }
  }
  return { scannedPorts: ports.length, killedProcesses };
}

async function globalSetup(): Promise<void> {
  // 0. Kill any orphan listeners from previous runs
  const portCleanup = await timeDiagnosticOperation(
    { scope: "global-setup", event: "kill-port-listeners" },
    killPortListeners,
  );
  console.info(
    `[e2e] scope=global-setup event=kill-port-listeners-summary status=info scannedPorts=${portCleanup.scannedPorts} killedProcesses=${portCleanup.killedProcesses}`,
  );

  // 1. Create template DB via drizzle-kit push
  await timeDiagnosticOperation(
    {
      scope: "global-setup",
      event: "prepare-template-db-path",
      fields: { templateDbPath: TEMPLATE_DB_PATH },
    },
    async () => {
      mkdirSync(dirname(TEMPLATE_DB_PATH), { recursive: true });
      if (existsSync(TEMPLATE_DB_PATH)) {
        unlinkSync(TEMPLATE_DB_PATH);
      }
    },
  );

  await timeDiagnosticOperation(
    {
      scope: "global-setup",
      event: "db-push",
      fields: { command: "bun run db:push", templateDbPath: TEMPLATE_DB_PATH },
    },
    async () => {
			try {
				execFileSync("bun", ["run", "db:push"], {
					cwd: PROJECT_ROOT,
					stdio: "pipe",
					env: { ...process.env, DATABASE_URL: TEMPLATE_DB_PATH },
				});
			} catch (error) {
				throw dbPushError(error);
			}
    },
  );

  // 1b. Seed download format definitions and checkpoint to main DB file.
  // db:push may create the DB in WAL mode; checkpointing ensures the copy
  // (which only copies the main file) includes the seeded data.
  await timeDiagnosticOperation(
    {
      scope: "global-setup",
      event: "seed-template-db",
      fields: { templateDbPath: TEMPLATE_DB_PATH },
    },
    async () => {
      const templateDb = new Database(TEMPLATE_DB_PATH);
      templateDb.pragma("journal_mode = DELETE");
      templateDb.exec(
        [
          "INSERT INTO download_formats (id, title, weight, color) VALUES",
          "(1, 'Unknown', 1, 'gray'),",
          "(2, 'PDF', 2, 'red'),",
          "(3, 'MOBI', 3, 'orange'),",
          "(4, 'EPUB', 4, 'green'),",
          "(5, 'AZW3', 5, 'blue'),",
          "(6, 'MP3', 6, 'purple'),",
          "(7, 'M4B', 7, 'pink'),",
          "(8, 'FLAC', 8, 'indigo')",
        ].join("\n"),
      );
      templateDb.pragma("wal_checkpoint(TRUNCATE)");
      templateDb.close();
    },
  );

  // 2. Write state file for test fixtures to read
  await timeDiagnosticOperation(
    {
      scope: "global-setup",
      event: "write-state-file",
      fields: { stateFile: STATE_FILE },
    },
    async () => {
      writeFileSync(
        STATE_FILE,
        JSON.stringify({
          templateDbPath: TEMPLATE_DB_PATH,
        }),
      );
    },
  );
}

export default globalSetup;
