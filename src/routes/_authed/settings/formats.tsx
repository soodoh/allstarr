import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { settingsMapQuery, downloadFormatsListQuery } from "src/lib/queries";
import { updateSettingFn } from "src/server/settings";
import { queryKeys } from "src/lib/query-keys";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import PageHeader from "src/components/shared/page-header";
import DownloadFormatList from "src/components/settings/download-formats/download-format-list";
import DownloadFormatForm from "src/components/settings/download-formats/download-format-form";
import {
  useCreateDownloadFormat,
  useDeleteDownloadFormat,
  useUpdateDownloadFormat,
} from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/formats")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(downloadFormatsListQuery()),
      context.queryClient.ensureQueryData(settingsMapQuery()),
    ]);
  },
  component: FormatsPage,
});

type FormatValues = {
  title: string;
  weight: number;
  color: string;
  minSize: number;
  maxSize: number | null;
  preferredSize: number | null;
  specifications: Array<{
    type: "releaseTitle" | "releaseGroup" | "size" | "indexerFlag";
    value: string;
    min?: number;
    max?: number;
    negate: boolean;
    required: boolean;
  }>;
  type: "ebook" | "audio" | "video";
  source: string | null;
  resolution: number;
  enabled: boolean;
};

function DefaultsSection({
  type,
  defaultPageCount,
  defaultAudioDuration,
  onUpdate,
}: {
  type: "ebook" | "audio";
  defaultPageCount: number;
  defaultAudioDuration: number;
  onUpdate: (key: string, value: number) => void;
}) {
  if (type === "ebook") {
    return (
      <div className="mb-4 rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
        <div className="flex items-center gap-3">
          <Label
            htmlFor="defaultPageCount"
            className="text-sm text-muted-foreground"
          >
            Default Page Count
          </Label>
          <Input
            id="defaultPageCount"
            type="number"
            className="w-20 h-8"
            defaultValue={defaultPageCount}
            onBlur={(e) => {
              const val = Number(e.target.value);
              if (val > 0 && val !== defaultPageCount) {
                onUpdate("format.defaultPageCount", val);
              }
            }}
          />
          <span className="text-xs text-muted-foreground">pages</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Used when an edition&apos;s page count is unavailable
        </p>
      </div>
    );
  }

  // type === "audio"
  const hours = Math.round((defaultAudioDuration / 60) * 10) / 10;
  return (
    <div className="mb-4 rounded-lg border bg-muted/30 p-4">
      <h4 className="text-sm font-medium mb-2">Size Calculation Defaults</h4>
      <div className="flex items-center gap-3">
        <Label
          htmlFor="defaultAudioDuration"
          className="text-sm text-muted-foreground"
        >
          Default Audio Duration
        </Label>
        <Input
          id="defaultAudioDuration"
          type="number"
          className="w-20 h-8"
          defaultValue={defaultAudioDuration}
          onBlur={(e) => {
            const val = Number(e.target.value);
            if (val > 0 && val !== defaultAudioDuration) {
              onUpdate("format.defaultAudioDuration", val);
            }
          }}
        />
        <span className="text-xs text-muted-foreground">
          minutes ({hours} hours)
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Used when an edition&apos;s audio duration is unavailable
      </p>
    </div>
  );
}

function FormatsPage() {
  const { data: definitions } = useSuspenseQuery(downloadFormatsListQuery());

  const { data: settingsMap } = useSuspenseQuery(settingsMapQuery());
  const queryClient = useQueryClient();

  const defaultPageCount = Number(
    settingsMap["format.defaultPageCount"] ?? 300,
  );
  const defaultAudioDuration = Number(
    settingsMap["format.defaultAudioDuration"] ?? 600,
  );

  const handleUpdateSetting = async (key: string, value: number) => {
    await updateSettingFn({ data: { key, value } });
    queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
  };

  const createDefinition = useCreateDownloadFormat();
  const updateDefinition = useUpdateDownloadFormat();
  const deleteDefinition = useDeleteDownloadFormat();

  const [activeTab, setActiveTab] = useState<"ebook" | "audio" | "video">(
    "ebook",
  );
  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<
    (typeof definitions)[number] | undefined
  >(undefined);

  const ebookFormats = useMemo(
    () => definitions.filter((d) => d.type === "ebook"),
    [definitions],
  );
  const audioFormats = useMemo(
    () => definitions.filter((d) => d.type === "audio"),
    [definitions],
  );
  const videoFormats = useMemo(
    () => definitions.filter((d) => d.type === "video"),
    [definitions],
  );

  const defLoading = createDefinition.isPending || updateDefinition.isPending;

  const handleCreateDefinition = (values: FormatValues) => {
    createDefinition.mutate(values, {
      onSuccess: () => setDefDialogOpen(false),
    });
  };

  const handleUpdateDefinition = (values: FormatValues) => {
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

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "ebook" | "audio" | "video")}
      >
        <TabsList>
          <TabsTrigger value="ebook">Ebook</TabsTrigger>
          <TabsTrigger value="audio">Audio</TabsTrigger>
          <TabsTrigger value="video">Video</TabsTrigger>
        </TabsList>
        <TabsContent value="ebook">
          <DefaultsSection
            type="ebook"
            defaultPageCount={defaultPageCount}
            defaultAudioDuration={defaultAudioDuration}
            onUpdate={handleUpdateSetting}
          />
          <DownloadFormatList
            definitions={ebookFormats}
            onEdit={handleEditDef}
            onDelete={(id) => deleteDefinition.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="audio">
          <DefaultsSection
            type="audio"
            defaultPageCount={defaultPageCount}
            defaultAudioDuration={defaultAudioDuration}
            onUpdate={handleUpdateSetting}
          />
          <DownloadFormatList
            definitions={audioFormats}
            onEdit={handleEditDef}
            onDelete={(id) => deleteDefinition.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="video">
          <DownloadFormatList
            definitions={videoFormats}
            onEdit={handleEditDef}
            onDelete={(id) => deleteDefinition.mutate(id)}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={defDialogOpen} onOpenChange={setDefDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingDef ? "Edit Format" : "Add Format"}
            </DialogTitle>
          </DialogHeader>
          <DownloadFormatForm
            type={activeTab}
            initialValues={
              editingDef
                ? {
                    title: editingDef.title,
                    weight: editingDef.weight,
                    color: editingDef.color ?? "gray",
                    minSize: editingDef.minSize ?? 0,
                    maxSize: editingDef.maxSize ?? null,
                    preferredSize: editingDef.preferredSize ?? null,
                    type: editingDef.type as "ebook" | "audio" | "video",
                    source: editingDef.source ?? null,
                    resolution: editingDef.resolution ?? 0,
                    enabled: editingDef.enabled ?? true,
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
