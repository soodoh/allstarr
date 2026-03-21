// oxlint-disable import/prefer-default-export -- named export for React hook convention
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type { QueueItem } from "src/server/queue";

type UseServerEventsReturn = {
  isConnected: boolean;
};

export function useServerEvents(): UseServerEventsReturn {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("open", () => setIsConnected(true));
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

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [queryClient]);

  return { isConnected };
}
