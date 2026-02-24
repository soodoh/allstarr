// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createQualityProfileFn,
  updateQualityProfileFn,
  deleteQualityProfileFn,
  updateQualityDefinitionFn,
} from "~/server/quality-profiles";
import { queryKeys } from "~/lib/query-keys";
import type {
  createQualityProfileSchema,
  updateQualityProfileSchema,
  updateQualityDefinitionSchema,
} from "~/lib/validators";
import type { z } from "zod";

export function useCreateQualityProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createQualityProfileSchema>) =>
      createQualityProfileFn({ data }),
    onSuccess: () => {
      toast.success("Profile created");
      queryClient.invalidateQueries({ queryKey: queryKeys.qualityProfiles.all });
    },
    onError: () => toast.error("Failed to create profile"),
  });
}

export function useUpdateQualityProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateQualityProfileSchema>) =>
      updateQualityProfileFn({ data }),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.qualityProfiles.all });
    },
    onError: () => toast.error("Failed to update profile"),
  });
}

export function useDeleteQualityProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteQualityProfileFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Profile deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.qualityProfiles.all });
    },
    onError: () => toast.error("Failed to delete profile"),
  });
}

export function useUpdateQualityDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateQualityDefinitionSchema>) =>
      updateQualityDefinitionFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityDefinitions.all,
      });
    },
    onError: () => toast.error("Failed to update quality definition"),
  });
}
