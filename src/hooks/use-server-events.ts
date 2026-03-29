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
): string {
  switch (commandType) {
    case "importAuthor": {
      const r = result as { booksAdded?: number; editionsAdded?: number };
      return `Author imported with ${r.booksAdded ?? 0} books`;
    }
    case "importBook": {
      return "Book imported successfully";
    }
    case "importManga": {
      const r = result as { chaptersAdded?: number; volumesAdded?: number };
      return `Manga added with ${r.chaptersAdded ?? 0} chapters and ${r.volumesAdded ?? 0} volumes`;
    }
    case "addShow": {
      const r = result as { seasonCount?: number };
      return `Show added with ${r.seasonCount ?? 0} seasons`;
    }
    case "refreshAuthor":
    case "refreshBook":
    case "refreshManga": {
      return "Metadata refreshed";
    }
    default: {
      return "Task completed";
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
      };
      toast.dismiss(`command-${data.commandId}`);
      toast.success(formatCommandResult(data.commandType, data.result));
      invalidateForCommand(queryClient, data.commandType);
    });

    es.addEventListener("commandFailed", (e) => {
      const data = JSON.parse(e.data) as {
        commandId: number;
        commandType: string;
        error: string;
      };
      toast.dismiss(`command-${data.commandId}`);
      toast.error(data.error);
    });

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [queryClient]);

  return { isConnected };
}
