// oxlint-disable explicit-module-boundary-types -- React hook return type is void
// oxlint-disable import/prefer-default-export -- named export for React hook convention
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";

export function useServerEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/events");

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

    return () => es.close();
  }, [queryClient]);
}
