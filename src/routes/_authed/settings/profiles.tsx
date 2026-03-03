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
import Separator from "src/components/ui/separator";
import PageHeader from "src/components/shared/page-header";
import QualityProfileList from "src/components/quality-profiles/quality-profile-list";
import QualityProfileForm from "src/components/quality-profiles/quality-profile-form";
import QualityDefinitionList from "src/components/quality-profiles/quality-definition-list";
import QualityDefinitionForm from "src/components/quality-profiles/quality-definition-form";
import {
  qualityProfilesListQuery,
  qualityDefinitionsListQuery,
  rootFoldersListQuery,
} from "src/lib/queries";
import {
  useCreateQualityProfile,
  useUpdateQualityProfile,
  useDeleteQualityProfile,
  useCreateQualityDefinition,
  useDeleteQualityDefinition,
  useUpdateQualityDefinition,
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
  const createDefinition = useCreateQualityDefinition();
  const updateDefinition = useUpdateQualityDefinition();
  const deleteDefinition = useDeleteQualityDefinition();

  // Profile dialog state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<
    (typeof profiles)[number] | undefined
  >(undefined);

  // Definition dialog state
  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<
    (typeof definitions)[number] | undefined
  >(undefined);

  const profileLoading = createProfile.isPending || updateProfile.isPending;
  const defLoading = createDefinition.isPending || updateDefinition.isPending;

  // Profile handlers
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

  // Definition handlers
  const handleCreateDefinition = (values: {
    title: string;
    weight: number;
    color: string;
    minSize: number;
    maxSize: number;
    preferredSize: number;
    specifications: Array<{
      type: "releaseTitle" | "releaseGroup" | "size" | "indexerFlag";
      value: string;
      min?: number;
      max?: number;
      negate: boolean;
      required: boolean;
    }>;
  }) => {
    createDefinition.mutate(values, {
      onSuccess: () => setDefDialogOpen(false),
    });
  };

  const handleUpdateDefinition = (values: {
    title: string;
    weight: number;
    color: string;
    minSize: number;
    maxSize: number;
    preferredSize: number;
    specifications: Array<{
      type: "releaseTitle" | "releaseGroup" | "size" | "indexerFlag";
      value: string;
      min?: number;
      max?: number;
      negate: boolean;
      required: boolean;
    }>;
  }) => {
    if (!editingDef) {
      return;
    }
    updateDefinition.mutate(
      { ...values, id: editingDef.id },
      {
        onSuccess: () => {
          setEditingDef(undefined);
          setDefDialogOpen(false);
        },
      },
    );
  };

  const handleEditDef = (def: (typeof definitions)[number]) => {
    setEditingDef(def);
    setDefDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Profiles"
        description="Manage quality definitions and profiles"
      />

      {/* Quality Definitions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Quality Definitions</h2>
            <p className="text-sm text-muted-foreground">
              Define format types and matching rules
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingDef(undefined);
              setDefDialogOpen(true);
            }}
          >
            Add Definition
          </Button>
        </div>
        <QualityDefinitionList
          definitions={definitions}
          onEdit={handleEditDef}
          onDelete={(id) => deleteDefinition.mutate(id)}
        />
      </div>

      <Separator className="my-8" />

      {/* Quality Profiles Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Quality Profiles</h2>
            <p className="text-sm text-muted-foreground">
              Configure format preferences per author
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingProfile(undefined);
              setProfileDialogOpen(true);
            }}
          >
            Add Profile
          </Button>
        </div>
        <QualityProfileList
          profiles={profiles}
          onEdit={(profile) =>
            handleEditProfile(profiles.find((p) => p.id === profile.id)!)
          }
          onDelete={(id) => deleteProfile.mutate(id)}
        />
      </div>

      {/* Profile Dialog */}
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

      {/* Definition Dialog */}
      <Dialog open={defDialogOpen} onOpenChange={setDefDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingDef ? "Edit Definition" : "Add Definition"}
            </DialogTitle>
          </DialogHeader>
          <QualityDefinitionForm
            initialValues={
              editingDef
                ? {
                    title: editingDef.title,
                    weight: editingDef.weight,
                    color: editingDef.color ?? "gray",
                    minSize: editingDef.minSize ?? 0,
                    maxSize: editingDef.maxSize ?? 0,
                    preferredSize: editingDef.preferredSize ?? 0,
                    specifications: Array.isArray(editingDef.specifications)
                      ? (editingDef.specifications as Array<{
                          type:
                            | "releaseTitle"
                            | "releaseGroup"
                            | "size"
                            | "indexerFlag";
                          value: string;
                          min?: number;
                          max?: number;
                          negate: boolean;
                          required: boolean;
                        }>)
                      : [],
                  }
                : undefined
            }
            onSubmit={
              editingDef ? handleUpdateDefinition : handleCreateDefinition
            }
            onCancel={() => setDefDialogOpen(false)}
            loading={defLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
