// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createCustomFormatFn,
  updateCustomFormatFn,
  deleteCustomFormatFn,
  duplicateCustomFormatFn,
  setProfileCFScoreFn,
  bulkSetProfileCFScoresFn,
  removeProfileCFsFn,
  addCategoryToProfileFn,
} from "src/server/custom-formats";
import { queryKeys } from "src/lib/query-keys";
import type {
  createCustomFormatSchema,
  updateCustomFormatSchema,
} from "src/lib/validators";
import type { z } from "zod";

export function useCreateCustomFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createCustomFormatSchema>) =>
      createCustomFormatFn({ data }),
    onSuccess: () => {
      toast.success("Custom format created");
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}

export function useUpdateCustomFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateCustomFormatSchema>) =>
      updateCustomFormatFn({ data }),
    onSuccess: () => {
      toast.success("Custom format updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}

export function useDeleteCustomFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCustomFormatFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Custom format deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}

export function useDuplicateCustomFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => duplicateCustomFormatFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Custom format duplicated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}

export function useSetProfileCFScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      profileId: number;
      customFormatId: number;
      score: number;
    }) => setProfileCFScoreFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}

export function useBulkSetProfileCFScores() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      profileId: number;
      scores: Array<{ customFormatId: number; score: number }>;
    }) => bulkSetProfileCFScoresFn({ data }),
    onSuccess: () => {
      toast.success("Custom format scores updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}

export function useRemoveProfileCFs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { profileId: number; customFormatIds: number[] }) =>
      removeProfileCFsFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}

export function useAddCategoryToProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { profileId: number; category: string }) =>
      addCategoryToProfileFn({ data }),
    onSuccess: () => {
      toast.success("Category formats added");
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
    },
  });
}
