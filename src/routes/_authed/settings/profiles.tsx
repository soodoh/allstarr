import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import PageHeader from "~/components/shared/page-header";
import QualityProfileList from "~/components/quality-profiles/quality-profile-list";
import QualityProfileForm from "~/components/quality-profiles/quality-profile-form";
import { qualityProfilesListQuery, qualityDefinitionsListQuery } from "~/lib/queries";
import {
  useCreateQualityProfile,
  useUpdateQualityProfile,
  useDeleteQualityProfile,
} from "~/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/profiles")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(qualityProfilesListQuery()),
      context.queryClient.ensureQueryData(qualityDefinitionsListQuery()),
    ]);
  },
  component: ProfilesPage,
});

function ProfilesPage() {
  const { data: profiles } = useSuspenseQuery(qualityProfilesListQuery());
  const { data: definitions } = useSuspenseQuery(qualityDefinitionsListQuery());

  const createProfile = useCreateQualityProfile();
  const updateProfile = useUpdateQualityProfile();
  const deleteProfile = useDeleteQualityProfile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof profiles)[number] | undefined>(
    undefined,
  );

  const loading =
    createProfile.isPending || updateProfile.isPending;

  const mappedProfiles = useMemo(
    () => profiles.map((p) => ({ ...p, items: p.items ?? undefined })),
    [profiles],
  );

  const handleCreate = (values: {
    name: string;
    cutoff: number;
    items: Array<{ quality: { id: number; name: string }; allowed: boolean }>;
    upgradeAllowed: boolean;
  }) => {
    createProfile.mutate(values, {
      onSuccess: () => {
        setDialogOpen(false);
      },
    });
  };

  const handleUpdate = (values: {
    name: string;
    cutoff: number;
    items: Array<{ quality: { id: number; name: string }; allowed: boolean }>;
    upgradeAllowed: boolean;
  }) => {
    if (!editing) {return;}
    updateProfile.mutate(
      { ...values, id: editing.id },
      {
        onSuccess: () => {
          setEditing(undefined);
          setDialogOpen(false);
        },
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteProfile.mutate(id);
  };

  const handleEdit = (profile: (typeof profiles)[number]) => {
    setEditing(profile);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Quality Profiles"
        description="Manage quality profiles for your library"
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            Add Profile
          </Button>
        }
      />

      <QualityProfileList
        profiles={mappedProfiles}
        onEdit={(profile) => handleEdit(profiles.find((p) => p.id === profile.id)!)}
        onDelete={handleDelete}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Profile" : "Add Profile"}
            </DialogTitle>
          </DialogHeader>
          <QualityProfileForm
            initialValues={
              editing
                ? {
                    name: editing.name,
                    cutoff: editing.cutoff,
                    items:
                      (editing.items as Array<{
                        quality: { id: number; name: string };
                        allowed: boolean;
                      }>) || [],
                    upgradeAllowed: editing.upgradeAllowed,
                  }
                : undefined
            }
            qualityDefinitions={definitions}
            onSubmit={editing ? handleUpdate : handleCreate}
            onCancel={() => setDialogOpen(false)}
            loading={loading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
