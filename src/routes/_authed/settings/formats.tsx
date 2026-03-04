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
import QualityDefinitionList from "src/components/settings/quality-profiles/quality-definition-list";
import QualityDefinitionForm from "src/components/settings/quality-profiles/quality-definition-form";
import { qualityDefinitionsListQuery } from "src/lib/queries";
import {
  useCreateQualityDefinition,
  useDeleteQualityDefinition,
  useUpdateQualityDefinition,
} from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/formats")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(qualityDefinitionsListQuery());
  },
  component: FormatsPage,
});

function FormatsPage() {
  const { data: definitions } = useSuspenseQuery(qualityDefinitionsListQuery());

  const createDefinition = useCreateQualityDefinition();
  const updateDefinition = useUpdateQualityDefinition();
  const deleteDefinition = useDeleteQualityDefinition();

  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<
    (typeof definitions)[number] | undefined
  >(undefined);

  const defLoading = createDefinition.isPending || updateDefinition.isPending;

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
        title="Formats"
        description="Define format types and matching rules"
        actions={
          <Button
            onClick={() => {
              setEditingDef(undefined);
              setDefDialogOpen(true);
            }}
          >
            Add Format
          </Button>
        }
      />

      <div className="space-y-4">
        <QualityDefinitionList
          definitions={definitions}
          onEdit={handleEditDef}
          onDelete={(id) => deleteDefinition.mutate(id)}
        />
      </div>

      <Dialog open={defDialogOpen} onOpenChange={setDefDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingDef ? "Edit Format" : "Add Format"}
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
