import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "src/components/ui/sheet";
import PageHeader from "src/components/shared/page-header";
import CustomFormatList from "src/components/settings/custom-formats/custom-format-list";
import CustomFormatForm from "src/components/settings/custom-formats/custom-format-form";
import { customFormatsListQuery } from "src/lib/queries/custom-formats";
import {
  useCreateCustomFormat,
  useUpdateCustomFormat,
  useDeleteCustomFormat,
  useDuplicateCustomFormat,
} from "src/hooks/mutations/custom-formats";

export const Route = createFileRoute("/_authed/settings/custom-formats")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(customFormatsListQuery());
  },
  component: CustomFormatsPage,
});

function CustomFormatsPage() {
  const { data: customFormats } = useSuspenseQuery(customFormatsListQuery());

  const createCustomFormat = useCreateCustomFormat();
  const updateCustomFormat = useUpdateCustomFormat();
  const deleteCustomFormat = useDeleteCustomFormat();
  const duplicateCustomFormat = useDuplicateCustomFormat();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFormat, setEditingFormat] = useState<
    (typeof customFormats)[number] | undefined
  >(undefined);

  const handleEdit = (cf: (typeof customFormats)[number]) => {
    setEditingFormat(cf);
    setEditDialogOpen(true);
  };

  const handleToggleEnabled = (
    cf: (typeof customFormats)[number],
    enabled: boolean,
  ) => {
    updateCustomFormat.mutate({
      id: cf.id,
      name: cf.name,
      category: cf.category as Parameters<
        typeof updateCustomFormat.mutate
      >[0]["category"],
      specifications: cf.specifications,
      defaultScore: cf.defaultScore,
      contentTypes: cf.contentTypes as Parameters<
        typeof updateCustomFormat.mutate
      >[0]["contentTypes"],
      includeInRenaming: cf.includeInRenaming,
      description: cf.description,
      enabled,
    });
  };

  const handleCreate = (
    values: Parameters<typeof createCustomFormat.mutate>[0],
  ) => {
    createCustomFormat.mutate(values, {
      onSuccess: () => setEditDialogOpen(false),
    });
  };

  const handleUpdate = (
    values: Parameters<typeof createCustomFormat.mutate>[0],
  ) => {
    if (!editingFormat) {
      return;
    }
    updateCustomFormat.mutate(
      { ...values, id: editingFormat.id },
      {
        onSuccess: () => {
          setEditingFormat(undefined);
          setEditDialogOpen(false);
        },
      },
    );
  };

  const activeMutation = editingFormat
    ? updateCustomFormat
    : createCustomFormat;
  const formLoading =
    createCustomFormat.isPending || updateCustomFormat.isPending;

  return (
    <div>
      <PageHeader
        title="Custom Formats"
        description="Define matching rules that score releases for download profile prioritization"
        actions={
          <Button
            onClick={() => {
              setEditingFormat(undefined);
              setEditDialogOpen(true);
            }}
          >
            Add Custom Format
          </Button>
        }
      />

      <div className="space-y-4">
        <CustomFormatList
          customFormats={customFormats}
          onEdit={handleEdit}
          onDuplicate={(id) => duplicateCustomFormat.mutate(id)}
          onDelete={(id) => deleteCustomFormat.mutate(id)}
          onToggleEnabled={handleToggleEnabled}
        />
      </div>

      <Sheet open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editingFormat ? "Edit Custom Format" : "Add Custom Format"}
            </SheetTitle>
            <SheetDescription>
              {editingFormat
                ? "Modify the custom format matching rules and scoring."
                : "Create a new custom format to score releases during download evaluation."}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <CustomFormatForm
              key={editingFormat?.id ?? "new"}
              initialValues={
                editingFormat
                  ? {
                      id: editingFormat.id,
                      name: editingFormat.name,
                      category: editingFormat.category,
                      specifications: editingFormat.specifications,
                      defaultScore: editingFormat.defaultScore,
                      contentTypes: editingFormat.contentTypes,
                      includeInRenaming: editingFormat.includeInRenaming,
                      description: editingFormat.description,
                      enabled: editingFormat.enabled,
                    }
                  : undefined
              }
              onSubmit={editingFormat ? handleUpdate : handleCreate}
              onCancel={() => setEditDialogOpen(false)}
              loading={formLoading}
              serverError={activeMutation.error?.message}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
