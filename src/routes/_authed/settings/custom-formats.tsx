import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "src/components/ui/button";
import PageHeader from "src/components/shared/page-header";
import CustomFormatList from "src/components/settings/custom-formats/custom-format-list";
import { customFormatsListQuery } from "src/lib/queries/custom-formats";
import {
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

  const updateCustomFormat = useUpdateCustomFormat();
  const deleteCustomFormat = useDeleteCustomFormat();
  const duplicateCustomFormat = useDuplicateCustomFormat();

  // State for edit dialog — will be wired in Task 10
  const [_editDialogOpen, setEditDialogOpen] = useState(false);
  const [_editingFormat, setEditingFormat] = useState<
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
    </div>
  );
}
