import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { PageHeader } from "~/components/shared/page-header";
import { QualityProfileList } from "~/components/quality-profiles/quality-profile-list";
import { QualityProfileForm } from "~/components/quality-profiles/quality-profile-form";
import {
  getQualityProfilesFn,
  getQualityDefinitionsFn,
  createQualityProfileFn,
  updateQualityProfileFn,
  deleteQualityProfileFn,
} from "~/server/quality-profiles";

export const Route = createFileRoute("/_authed/settings/profiles")({
  loader: async () => {
    const [profiles, definitions] = await Promise.all([
      getQualityProfilesFn(),
      getQualityDefinitionsFn(),
    ]);
    return { profiles, definitions };
  },
  component: ProfilesPage,
});

function ProfilesPage() {
  const { profiles, definitions } = Route.useLoaderData();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof profiles)[number] | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const handleCreate = async (values: {
    name: string;
    cutoff: number;
    items: { quality: { id: number; name: string }; allowed: boolean }[];
    upgradeAllowed: boolean;
  }) => {
    setLoading(true);
    try {
      await createQualityProfileFn({ data: values });
      toast.success("Profile created");
      setDialogOpen(false);
      router.invalidate();
    } catch {
      toast.error("Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (values: {
    name: string;
    cutoff: number;
    items: { quality: { id: number; name: string }; allowed: boolean }[];
    upgradeAllowed: boolean;
  }) => {
    if (!editing) return;
    setLoading(true);
    try {
      await updateQualityProfileFn({
        data: { ...values, id: editing.id },
      });
      toast.success("Profile updated");
      setEditing(null);
      setDialogOpen(false);
      router.invalidate();
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteQualityProfileFn({ data: { id } });
      toast.success("Profile deleted");
      router.invalidate();
    } catch {
      toast.error("Failed to delete profile");
    }
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
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Add Profile
          </Button>
        }
      />

      <QualityProfileList
        profiles={profiles}
        onEdit={handleEdit}
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
                    items: (editing.items as { quality: { id: number; name: string }; allowed: boolean }[]) || [],
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
