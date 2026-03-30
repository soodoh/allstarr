// oxlint-disable import/prefer-default-export -- named export for React hook convention
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import { getActiveCommandsFn } from "src/server/commands";
import type { QueueItem } from "src/server/queue";

type UseServerEventsReturn = {
  isConnected: boolean;
};

function formatCommandResult(
  commandType: string,
  result: Record<string, unknown>,
  title: string,
): string {
  const label = title || "Unknown";
  switch (commandType) {
    case "importAuthor": {
      const r = result as { booksAdded?: number };
      return `${label} — Imported with ${r.booksAdded ?? 0} books`;
    }
    case "importBook": {
      return `${label} — Imported successfully`;
    }
    case "importManga": {
      const r = result as { chaptersAdded?: number; volumesAdded?: number };
      return `${label} — Added with ${r.chaptersAdded ?? 0} chapters and ${r.volumesAdded ?? 0} volumes`;
    }
    case "addShow": {
      const r = result as { seasonCount?: number };
      return `${label} — Added with ${r.seasonCount ?? 0} seasons`;
    }
    case "addMovie": {
      return `${label} — Added successfully`;
    }
    case "refreshAuthor":
    case "refreshBook":
    case "refreshManga": {
      return `${label} — Metadata refreshed`;
    }
    default: {
      return title ? `${title} — Task completed` : "Task completed";
    }
  }
}

function invalidateForCommand(
  queryClient: ReturnType<typeof useQueryClient>,
  commandType: string,
): void {
  switch (commandType) {
    case "importAuthor":
    case "refreshAuthor": {
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
    }
    case "importBook":
    case "refreshBook": {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
    }
    case "importManga":
    case "refreshManga": {
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
    }
    case "addShow": {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
    }
    case "addMovie": {
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
      break;
    }
    default: {
      // Unknown command types don't need cache invalidation
      break;
    }
  }
}

export function useServerEvents(): UseServerEventsReturn {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("open", () => {
      setIsConnected(true);
      // Restore toasts for any in-flight commands
      void (async () => {
        try {
          const commands = await getActiveCommandsFn();
          for (const cmd of commands) {
            toast.loading(cmd.progress ?? `Running: ${cmd.name}`, {
              id: `command-${cmd.id}`,
            });
          }
        } catch {
          // Silently ignore — reconnection is best-effort
        }
      })();
    });
    es.addEventListener("error", () => setIsConnected(false));

    es.addEventListener("queueProgress", (e) => {
      const event = JSON.parse(e.data) as {
        data: { items: QueueItem[]; warnings: string[] };
      };
      queryClient.setQueryData(queryKeys.queue.list(), event.data);
    });

    es.addEventListener("queueUpdated", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
    });

    es.addEventListener("taskUpdated", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    });

    es.addEventListener("downloadCompleted", (e) => {
      const data = JSON.parse(e.data) as { title: string };
      toast.info(`Download completed: ${data.title}`);
    });

    es.addEventListener("downloadFailed", (e) => {
      const data = JSON.parse(e.data) as { title: string; message: string };
      toast.error(`Download failed: ${data.title} — ${data.message}`);
    });

    es.addEventListener("importCompleted", (e) => {
      const data = JSON.parse(e.data) as {
        bookId: number | null;
        bookTitle: string;
      };
      if (data.bookId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.books.detail(data.bookId),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
      toast.success(`Imported: ${data.bookTitle}`);
    });

    es.addEventListener("commandProgress", (e) => {
      const data = JSON.parse(e.data) as {
        commandId: number;
        progress: string;
      };
      toast.loading(data.progress, { id: `command-${data.commandId}` });
    });

    es.addEventListener("commandCompleted", (e) => {
      const data = JSON.parse(e.data) as {
        commandId: number;
        commandType: string;
        result: Record<string, unknown>;
        title: string;
      };
      toast.dismiss(`command-${data.commandId}`);
      toast.success(
        formatCommandResult(data.commandType, data.result, data.title),
      );
      invalidateForCommand(queryClient, data.commandType);
    });

    es.addEventListener("commandFailed", (e) => {
      const data = JSON.parse(e.data) as {
        commandId: number;
        commandType: string;
        error: string;
        title: string;
      };
      toast.dismiss(`command-${data.commandId}`);
      toast.error(data.title ? `${data.title} — ${data.error}` : data.error);
    });

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [queryClient]);

  return { isConnected };
}
