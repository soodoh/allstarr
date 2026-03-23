import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import PageHeader from "src/components/shared/page-header";
import DownloadProfileList from "src/components/settings/download-profiles/download-profile-list";
import DownloadProfileForm from "src/components/settings/download-profiles/download-profile-form";
import {
  downloadProfilesListQuery,
  downloadFormatsListQuery,
} from "src/lib/queries";
import { getServerCwdFn } from "src/server/filesystem";
import {
  useCreateDownloadProfile,
  useUpdateDownloadProfile,
  useDeleteDownloadProfile,
} from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/profiles")({
  loader: async ({ context }) => {
    const results = await Promise.all([
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
      context.queryClient.ensureQueryData(downloadFormatsListQuery()),
      getServerCwdFn(),
    ]);
    return { serverCwd: results[2] };
  },
  component: ProfilesPage,
});

function ProfilesPage() {
  const { serverCwd } = Route.useLoaderData();
  const { data: profiles } = useSuspenseQuery(downloadProfilesListQuery());
  const { data: definitions } = useSuspenseQuery(downloadFormatsListQuery());

  const createProfile = useCreateDownloadProfile();
  const updateProfile = useUpdateDownloadProfile();
  const deleteProfile = useDeleteDownloadProfile();

  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<
    (typeof profiles)[number] | undefined
  >(undefined);

  const profileLoading = createProfile.isPending || updateProfile.isPending;

  const handleCreateProfile = (values: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[];
    upgradeAllowed: boolean;
    categories: number[];
    mediaType: string;
    contentType: string;
    enabled: boolean;
    language: string;
  }) => {
    createProfile.mutate(values, {
      onSuccess: () => setProfileDialogOpen(false),
    });
  };

  const handleUpdateProfile = (values: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[];
    upgradeAllowed: boolean;
    categories: number[];
    mediaType: string;
    contentType: string;
    enabled: boolean;
    language: string;
  }) => {
    if (!editingProfile) {
      return;
    }
    updateProfile.mutate(
      { ...values, id: editingProfile.id },
      {
        onSuccess: () => {
          setEditingProfile(undefined);
          setProfileDialogOpen(false);
        },
      },
    );
  };

  const handleToggleEnabled = (
    profile: (typeof profiles)[number],
    enabled: boolean,
  ) => {
    updateProfile.mutate({
      id: profile.id,
      name: profile.name,
      icon: profile.icon,
      rootFolderPath: profile.rootFolderPath,
      cutoff: profile.cutoff,
      items: profile.items,
      upgradeAllowed: profile.upgradeAllowed,
      categories: profile.categories,
      mediaType: profile.mediaType,
      contentType: profile.contentType,
      enabled,
      language: profile.language,
    });
  };

  const activeMutation = editingProfile ? updateProfile : createProfile;

  const handleEditProfile = (profile: (typeof profiles)[number]) => {
    setEditingProfile(profile);
    setProfileDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Profiles"
        description="Configure format preferences per author"
        actions={
          <Button
            onClick={() => {
              setEditingProfile(undefined);
              setProfileDialogOpen(true);
            }}
          >
            Add Profile
          </Button>
        }
      />

      <div className="space-y-4">
        <DownloadProfileList
          profiles={profiles}
          definitions={definitions}
          onEdit={(profile) =>
            handleEditProfile(profiles.find((p) => p.id === profile.id)!)
          }
          onDelete={(id) => deleteProfile.mutate(id)}
          onToggleEnabled={handleToggleEnabled}
        />
      </div>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? "Edit Profile" : "Add Profile"}
            </DialogTitle>
          </DialogHeader>
          <DownloadProfileForm
            initialValues={
              editingProfile
                ? {
                    name: editingProfile.name,
                    icon: editingProfile.icon,
                    rootFolderPath: editingProfile.rootFolderPath,
                    cutoff: editingProfile.cutoff,
                    items: editingProfile.items,
                    upgradeAllowed: editingProfile.upgradeAllowed,
                    categories: editingProfile.categories,
                    mediaType: editingProfile.mediaType,
                    contentType: editingProfile.contentType,
                    enabled: editingProfile.enabled,
                    language: editingProfile.language,
                  }
                : undefined
            }
            downloadFormats={definitions}
            serverCwd={serverCwd}
            onSubmit={
              editingProfile ? handleUpdateProfile : handleCreateProfile
            }
            onCancel={() => setProfileDialogOpen(false)}
            loading={profileLoading}
            serverError={activeMutation.error?.message}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
