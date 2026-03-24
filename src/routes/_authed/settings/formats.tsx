import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { settingsMapQuery, downloadFormatsListQuery } from "src/lib/queries";
import { updateSettingFn } from "src/server/settings";
import { queryKeys } from "src/lib/query-keys";
import { Search } from "lucide-react";
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
  maxSize: number;
  preferredSize: number;
  noMaxLimit: number;
  noPreferredLimit: number;
  contentTypes: string[];
  source: string | null;
  resolution: number;
};

const DEFAULTS_CONFIG: Record<
  "ebook" | "audiobook" | "movie" | "tv",
  { label: string; key: string; fallback: number; unit: string; hint: string }
> = {
  ebook: {
    label: "Default Page Count",
    key: "format.ebook.defaultPageCount",
    fallback: 300,
    unit: "pages",
    hint: "Used when an edition\u2019s page count is unavailable",
  },
  audiobook: {
    label: "Default Audio Duration",
    key: "format.audiobook.defaultDuration",
    fallback: 600,
    unit: "minutes",
    hint: "Used when an edition\u2019s audio duration is unavailable",
  },
  movie: {
    label: "Default Runtime",
    key: "format.movie.defaultRuntime",
    fallback: 130,
    unit: "minutes",
    hint: "Used when a movie\u2019s runtime is unavailable",
  },
  tv: {
    label: "Default Episode Runtime",
    key: "format.tv.defaultEpisodeRuntime",
    fallback: 45,
    unit: "minutes",
    hint: "Used when an episode\u2019s runtime is unavailable",
  },
};

function DefaultsSection({
  contentType,
  settingsMap,
  onUpdate,
}: {
  contentType: "all" | "ebook" | "audiobook" | "movie" | "tv";
  settingsMap: Record<string, unknown>;
  onUpdate: (key: string, value: number) => void;
}) {
  const configs =
    contentType === "all"
      ? (Object.keys(DEFAULTS_CONFIG) as Array<keyof typeof DEFAULTS_CONFIG>)
      : [contentType];

  const description =
    contentType === "all"
      ? "These values are used when the corresponding runtime, duration, or page count is unavailable."
      : DEFAULTS_CONFIG[contentType].hint;

  return (
    <div className="mb-4 rounded-lg border bg-muted/30 p-4">
      <h4 className="text-sm font-medium">Size Calculation Defaults</h4>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div
        className="grid items-center gap-x-3 gap-y-2"
        style={{ gridTemplateColumns: "auto 5rem auto" }}
      >
        {configs.map((ct) => {
          const cfg = DEFAULTS_CONFIG[ct];
          const currentValue = Number(settingsMap[cfg.key] ?? cfg.fallback);
          return (
            <Fragment key={ct}>
              <Label
                htmlFor={`default-${ct}`}
                className="text-sm text-muted-foreground whitespace-nowrap text-right"
              >
                {cfg.label}
              </Label>
              <Input
                id={`default-${ct}`}
                type="number"
                className="h-8"
                defaultValue={currentValue}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val > 0 && val !== currentValue) {
                    onUpdate(cfg.key, val);
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">{cfg.unit}</span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

type TabValue = "all" | "movie" | "tv" | "ebook" | "audiobook";

function FormatsPage() {
  const { data: definitions } = useSuspenseQuery(downloadFormatsListQuery());

  const { data: settingsMap } = useSuspenseQuery(settingsMapQuery());
  const queryClient = useQueryClient();

  const handleUpdateSetting = async (key: string, value: number) => {
    await updateSettingFn({ data: { key, value } });
    queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
  };

  const createDefinition = useCreateDownloadFormat();
  const updateDefinition = useUpdateDownloadFormat();
  const deleteDefinition = useDeleteDownloadFormat();

  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");
  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<
    (typeof definitions)[number] | undefined
  >(undefined);

  const filteredFormats = useMemo(() => {
    let result = definitions;
    if (activeTab !== "all") {
      result = result.filter((d) => d.contentTypes.includes(activeTab));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }
    return result;
  }, [definitions, activeTab, search]);

  const dialogContentTypes = useMemo(() => {
    if (editingDef) {
      return editingDef.contentTypes;
    }
    return activeTab === "all" ? ["ebook"] : [activeTab];
  }, [editingDef, activeTab]);

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
        onValueChange={(v) => setActiveTab(v as TabValue)}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="movie">Movie</TabsTrigger>
          <TabsTrigger value="tv">TV</TabsTrigger>
          <TabsTrigger value="ebook">Ebook</TabsTrigger>
          <TabsTrigger value="audiobook">Audiobook</TabsTrigger>
        </TabsList>

        <div className="relative my-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search formats..."
            className="pl-8"
          />
        </div>

        <TabsContent value={activeTab} className="mt-0">
          <DefaultsSection
            key={activeTab}
            contentType={activeTab}
            settingsMap={settingsMap}
            onUpdate={handleUpdateSetting}
          />
          <DownloadFormatList
            definitions={filteredFormats}
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
            defaultContentTypes={dialogContentTypes}
            initialValues={
              editingDef
                ? {
                    title: editingDef.title,
                    weight: editingDef.weight,
                    color: editingDef.color ?? "gray",
                    minSize: editingDef.minSize ?? 0,
                    maxSize: editingDef.maxSize ?? 0,
                    preferredSize: editingDef.preferredSize ?? 0,
                    noMaxLimit: editingDef.noMaxLimit ?? 0,
                    noPreferredLimit: editingDef.noPreferredLimit ?? 0,
                    contentTypes: editingDef.contentTypes,
                    source: editingDef.source ?? null,
                    resolution: editingDef.resolution ?? 0,
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
