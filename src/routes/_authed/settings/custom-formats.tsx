import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "src/components/ui/sheet";
import Label from "src/components/ui/label";
import PageHeader from "src/components/shared/page-header";
import CustomFormatList from "src/components/settings/custom-formats/custom-format-list";
import CustomFormatForm from "src/components/settings/custom-formats/custom-format-form";
import { customFormatsListQuery } from "src/lib/queries/custom-formats";
import { queryKeys } from "src/lib/query-keys";
import {
  useCreateCustomFormat,
  useUpdateCustomFormat,
  useDeleteCustomFormat,
  useDuplicateCustomFormat,
} from "src/hooks/mutations/custom-formats";
import {
  exportCustomFormatsFn,
  importCustomFormatsFn,
} from "src/server/custom-format-import-export";

export const Route = createFileRoute("/_authed/settings/custom-formats")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(customFormatsListQuery());
  },
  component: CustomFormatsPage,
});

type ImportMode = "skip" | "overwrite" | "copy";

const IMPORT_MODE_LABELS: Record<
  ImportMode,
  { label: string; description: string }
> = {
  skip: {
    label: "Skip existing",
    description: "Keep existing custom formats unchanged",
  },
  overwrite: {
    label: "Overwrite existing",
    description: "Update existing custom formats with imported data",
  },
  copy: {
    label: "Create copies",
    description: 'Import as new with "(Imported)" suffix',
  },
};

function CustomFormatsPage() {
  const { data: customFormats } = useSuspenseQuery(customFormatsListQuery());
  const queryClient = useQueryClient();

  const createCustomFormat = useCreateCustomFormat();
  const updateCustomFormat = useUpdateCustomFormat();
  const deleteCustomFormat = useDeleteCustomFormat();
  const duplicateCustomFormat = useDuplicateCustomFormat();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFormat, setEditingFormat] = useState<
    (typeof customFormats)[number] | undefined
  >(undefined);

  // Import/Export state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("skip");
  const [importData, setImportData] = useState<unknown[] | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const ids = customFormats.map((cf) => cf.id);
      const result = await exportCustomFormatsFn({
        data: { customFormatIds: ids },
      });
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `custom-formats-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${customFormats.length} custom format(s)`);
    } catch (error) {
      toast.error(
        `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setImportFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const cfs = parsed.customFormats ?? parsed;
      if (!Array.isArray(cfs)) {
        toast.error("Invalid file: expected an array of custom formats");
        return;
      }
      setImportData(cfs);
      setImportDialogOpen(true);
    } catch {
      toast.error("Invalid JSON file");
    }

    // Reset file input so the same file can be re-selected
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!importData) {
      return;
    }
    setImporting(true);
    try {
      const result = await importCustomFormatsFn({
        data: {
          customFormats: importData as Parameters<
            typeof importCustomFormatsFn
          >[0]["data"]["customFormats"],
          mode: importMode,
        },
      });
      toast.success(
        `Imported ${result.imported} custom format(s)${result.skipped > 0 ? `, skipped ${result.skipped}` : ""}`,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFormats.all,
      });
      setImportDialogOpen(false);
      setImportData(null);
      setImportFileName("");
    } catch (error) {
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setImporting(false);
    }
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
          <>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || customFormats.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
            <Button
              onClick={() => {
                setEditingFormat(undefined);
                setEditDialogOpen(true);
              }}
            >
              Add Custom Format
            </Button>
          </>
        }
      />

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelect}
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

      {/* Import dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Custom Formats</DialogTitle>
            <DialogDescription>
              {importData
                ? `Found ${importData.length} custom format(s) in "${importFileName}". Choose how to handle duplicates.`
                : "Select a JSON file to import."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Duplicate handling</Label>
            {(Object.keys(IMPORT_MODE_LABELS) as ImportMode[]).map((mode) => (
              <label
                key={mode}
                aria-label={IMPORT_MODE_LABELS[mode].label}
                className="flex items-start gap-3 cursor-pointer rounded-md border p-3 hover:bg-accent/50 transition-colors"
              >
                <input
                  type="radio"
                  name="importMode"
                  value={mode}
                  checked={importMode === mode}
                  onChange={() => setImportMode(mode)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">
                    {IMPORT_MODE_LABELS[mode].label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {IMPORT_MODE_LABELS[mode].description}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                setImportData(null);
                setImportFileName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing || !importData}>
              {importing ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
