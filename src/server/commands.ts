// oxlint-disable no-console -- Command runner logs are intentional server-side diagnostics
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { activeAdhocCommands } from "src/db/schema";
import { eq } from "drizzle-orm";
import { eventBus } from "./event-bus";
import { requireAuth } from "./middleware";
import { isTaskRunning } from "./scheduler/state";

export type CommandHandler = (
  body: Record<string, unknown>,
  updateProgress: (message: string) => void,
  setTitle: (title: string) => void,
) => Promise<Record<string, unknown>>;

type SubmitCommandOptions = {
  commandType: string;
  name: string;
  body: Record<string, unknown>;
  /** Field name in body used as the unique key for duplicate detection */
  dedupeKey: string;
  /** If set, check this scheduled task ID for batch overlap */
  batchTaskId?: string;
  handler: CommandHandler;
};

function checkDuplicate(
  commandType: string,
  dedupeKey: string,
  body: Record<string, unknown>,
): void {
  const dedupeValue = body[dedupeKey];
  if (dedupeValue === undefined) {
    return;
  }

  const existing = db
    .select({ id: activeAdhocCommands.id, body: activeAdhocCommands.body })
    .from(activeAdhocCommands)
    .where(eq(activeAdhocCommands.commandType, commandType))
    .all();

  for (const row of existing) {
    if ((row.body as Record<string, unknown>)[dedupeKey] === dedupeValue) {
      throw new Error("This task is already running.");
    }
  }
}

function checkBatchOverlap(batchTaskId: string): void {
  if (isTaskRunning(batchTaskId)) {
    throw new Error(
      "A batch metadata refresh is already running. Wait for it to complete or check the Tasks page for progress.",
    );
  }
}

async function doWork(
  commandId: number,
  commandType: string,
  handler: CommandHandler,
  body: Record<string, unknown>,
): Promise<void> {
  let title = "";

  const setTitle = (t: string): void => {
    title = t;
  };

  const updateProgress = (message: string): void => {
    const progress = title ? `${title} — ${message}` : message;
    db.update(activeAdhocCommands)
      .set({ progress })
      .where(eq(activeAdhocCommands.id, commandId))
      .run();
    eventBus.emit({ type: "commandProgress", commandId, progress });
  };

  try {
    const result = await handler(body, updateProgress, setTitle);
    eventBus.emit({
      type: "commandCompleted",
      commandId,
      commandType,
      result,
      title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[command] ${commandType} #${commandId} failed:`, error);
    eventBus.emit({
      type: "commandFailed",
      commandId,
      commandType,
      error: message,
      title,
    });
  } finally {
    db.delete(activeAdhocCommands)
      .where(eq(activeAdhocCommands.id, commandId))
      .run();
  }
}

export function submitCommand(opts: SubmitCommandOptions): {
  commandId: number;
} {
  const { commandType, name, body, dedupeKey, batchTaskId, handler } = opts;

  checkDuplicate(commandType, dedupeKey, body);
  if (batchTaskId) {
    checkBatchOverlap(batchTaskId);
  }

  const row = db
    .insert(activeAdhocCommands)
    .values({
      commandType,
      name,
      body,
      startedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  // Fire and forget — intentionally not awaited
  // oxlint-disable-next-line prefer-await-to-then
  void doWork(row.id, commandType, handler, body).catch((error) =>
    console.error(
      `[command] Uncaught error in ${commandType} #${row.id}:`,
      error,
    ),
  );

  return { commandId: row.id };
}

// Server function to fetch active commands (used for SSE reconnection)
export const getActiveCommandsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(activeAdhocCommands).all();
  },
);
