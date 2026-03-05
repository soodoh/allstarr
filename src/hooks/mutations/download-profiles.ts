// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createDownloadProfileFn,
  updateDownloadProfileFn,
  deleteDownloadProfileFn,
  createDownloadFormatFn,
  updateDownloadFormatFn,
  deleteDownloadFormatFn,
} from "src/server/download-profiles";
import { queryKeys } from "src/lib/query-keys";
import type {
  createDownloadProfileSchema,
  updateDownloadProfileSchema,
  createDownloadFormatSchema,
  updateDownloadFormatSchema,
} from "src/lib/validators";
import type { z } from "zod";

export function useCreateDownloadProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createDownloadProfileSchema>) =>
      createDownloadProfileFn({ data }),
    onSuccess: () => {
      toast.success("Profile created");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadProfiles.all,
      });
    },
  });
}

export function useUpdateDownloadProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateDownloadProfileSchema>) =>
      updateDownloadProfileFn({ data }),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadProfiles.all,
      });
    },
  });
}

export function useDeleteDownloadProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteDownloadProfileFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Profile deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadProfiles.all,
      });
    },
    onError: () => toast.error("Failed to delete profile"),
  });
}

export function useCreateDownloadFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createDownloadFormatSchema>) =>
      createDownloadFormatFn({ data }),
    onSuccess: () => {
      toast.success("Format created");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadFormats.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadProfiles.all,
      });
    },
    onError: () => toast.error("Failed to create download format"),
  });
}

export function useUpdateDownloadFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateDownloadFormatSchema>) =>
      updateDownloadFormatFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadFormats.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadProfiles.all,
      });
    },
    onError: () => toast.error("Failed to update download format"),
  });
}

export function useDeleteDownloadFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteDownloadFormatFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Format deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadFormats.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadProfiles.all,
      });
    },
    onError: () => toast.error("Failed to delete download format"),
  });
}
