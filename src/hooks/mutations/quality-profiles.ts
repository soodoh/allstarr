// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createQualityProfileFn,
  updateQualityProfileFn,
  deleteQualityProfileFn,
  createQualityDefinitionFn,
  updateQualityDefinitionFn,
  deleteQualityDefinitionFn,
} from "src/server/quality-profiles";
import { queryKeys } from "src/lib/query-keys";
import type {
  createQualityProfileSchema,
  updateQualityProfileSchema,
  createQualityDefinitionSchema,
  updateQualityDefinitionSchema,
} from "src/lib/validators";
import type { z } from "zod";

export function useCreateQualityProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createQualityProfileSchema>) =>
      createQualityProfileFn({ data }),
    onSuccess: () => {
      toast.success("Profile created");
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityProfiles.all,
      });
    },
  });
}

export function useUpdateQualityProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateQualityProfileSchema>) =>
      updateQualityProfileFn({ data }),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityProfiles.all,
      });
    },
  });
}

export function useDeleteQualityProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteQualityProfileFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Profile deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityProfiles.all,
      });
    },
    onError: () => toast.error("Failed to delete profile"),
  });
}

export function useCreateQualityDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createQualityDefinitionSchema>) =>
      createQualityDefinitionFn({ data }),
    onSuccess: () => {
      toast.success("Definition created");
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityDefinitions.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityProfiles.all,
      });
    },
    onError: () => toast.error("Failed to create quality definition"),
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityProfiles.all,
      });
    },
    onError: () => toast.error("Failed to update quality definition"),
  });
}

export function useDeleteQualityDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteQualityDefinitionFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Definition deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityDefinitions.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.qualityProfiles.all,
      });
    },
    onError: () => toast.error("Failed to delete quality definition"),
  });
}
