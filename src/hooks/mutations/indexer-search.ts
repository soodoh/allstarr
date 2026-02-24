// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { searchIndexersFn, grabReleaseFn } from "~/server/indexers";
import type { searchIndexersSchema, grabReleaseSchema } from "~/lib/validators";
import type { z } from "zod";

export function useSearchIndexers() {
  return useMutation({
    mutationFn: (data: z.infer<typeof searchIndexersSchema>) =>
      searchIndexersFn({ data }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Search failed"),
  });
}

export function useGrabRelease() {
  return useMutation({
    mutationFn: (data: z.infer<typeof grabReleaseSchema>) =>
      grabReleaseFn({ data }),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to grab release",
      ),
  });
}
