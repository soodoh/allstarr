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
import QualityProfileList from "src/components/quality-profiles/quality-profile-list";
import QualityProfileForm from "src/components/quality-profiles/quality-profile-form";
import {
  qualityProfilesListQuery,
  qualityDefinitionsListQuery,
  rootFoldersListQuery,
} from "src/lib/queries";
import {
  useCreateQualityProfile,
  useUpdateQualityProfile,
  useDeleteQualityProfile,
} from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/profiles")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(qualityProfilesListQuery()),
      context.queryClient.ensureQueryData(qualityDefinitionsListQuery()),
      context.queryClient.ensureQueryData(rootFoldersListQuery()),
    ]);
  },
  component: ProfilesPage,
});

function ProfilesPage() {
  const { data: profiles } = useSuspenseQuery(qualityProfilesListQuery());
  const { data: definitions } = useSuspenseQuery(qualityDefinitionsListQuery());
  const { data: rootFolders } = useSuspenseQuery(rootFoldersListQuery());

  const createProfile = useCreateQualityProfile();
  const updateProfile = useUpdateQualityProfile();
  const deleteProfile = useDeleteQualityProfile();

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
    items: Array<{ quality: { id: number; name: string }; allowed: boolean }>;
    upgradeAllowed: boolean;
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
    items: Array<{ quality: { id: number; name: string }; allowed: boolean }>;
    upgradeAllowed: boolean;
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
        <QualityProfileList
          profiles={profiles}
          onEdit={(profile) =>
            handleEditProfile(profiles.find((p) => p.id === profile.id)!)
          }
          onDelete={(id) => deleteProfile.mutate(id)}
        />
      </div>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? "Edit Profile" : "Add Profile"}
            </DialogTitle>
          </DialogHeader>
          <QualityProfileForm
            initialValues={
              editingProfile
                ? {
                    name: editingProfile.name,
                    icon: editingProfile.icon,
                    rootFolderPath: editingProfile.rootFolderPath,
                    cutoff: editingProfile.cutoff,
                    items:
                      (editingProfile.items as Array<{
                        quality: { id: number; name: string };
                        allowed: boolean;
                      }>) || [],
                    upgradeAllowed: editingProfile.upgradeAllowed,
                  }
                : undefined
            }
            qualityDefinitions={definitions}
            rootFolders={rootFolders}
            onSubmit={
              editingProfile ? handleUpdateProfile : handleCreateProfile
            }
            onCancel={() => setProfileDialogOpen(false)}
            loading={profileLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
