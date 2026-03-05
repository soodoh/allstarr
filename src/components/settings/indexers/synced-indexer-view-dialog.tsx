import { useState, useEffect } from "react";
import type { JSX } from "react";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { Button } from "src/components/ui/button";
import CategoryMultiSelect from "src/components/shared/category-multi-select";

type DownloadClient = {
  id: number;
  name: string;
  protocol: string;
};

type SyncedIndexerEditDialogProps = {
  indexer: SyncedIndexer | null;
  downloadClients?: DownloadClient[];
  onSave: (id: number, downloadClientId: number | null) => void;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
};

function parseCategories(raw: string | null): number[] {
  try {
    return JSON.parse(raw ?? "[]") as number[];
  } catch {
    return [];
  }
}

export default function SyncedIndexerEditDialog({
  indexer,
  downloadClients = [],
  onSave,
  onOpenChange,
  loading,
}: SyncedIndexerEditDialogProps): JSX.Element {
  const [downloadClientId, setDownloadClientId] = useState<number | null>(null);

  useEffect(() => {
    if (indexer) {
      setDownloadClientId(indexer.downloadClientId ?? null);
    }
  }, [indexer]);

  const filteredClients = downloadClients.filter(
    (c) => indexer && c.protocol === indexer.protocol,
  );

  return (
    <Dialog open={indexer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Synced Indexer</DialogTitle>
          <DialogDescription>
            Synced fields are managed by Prowlarr. You can set a download client
            override.
          </DialogDescription>
        </DialogHeader>

        {indexer && (
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={indexer.name} disabled />
            </div>

            {/* RSS / Search toggles */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={indexer.enableRss} disabled />
                <Label className="opacity-50">RSS</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={indexer.enableAutomaticSearch} disabled />
                <Label className="opacity-50">Automatic Search</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={indexer.enableInteractiveSearch} disabled />
                <Label className="opacity-50">Interactive Search</Label>
              </div>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input value={indexer.baseUrl} disabled />
            </div>

            {/* Implementation / Protocol */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Implementation</Label>
                <Input value={indexer.implementation} disabled />
              </div>
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Input value={indexer.protocol} disabled />
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2 w-24">
              <Label>Priority</Label>
              <Input value={indexer.priority} disabled />
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <Label>Categories</Label>
              <CategoryMultiSelect
                value={parseCategories(indexer.categories)}
                disabled
              />
            </div>

            {/* Download Client — editable */}
            {filteredClients.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="synced-download-client">
                  Download Client{" "}
                  <span className="text-muted-foreground text-xs">
                    (override)
                  </span>
                </Label>
                <Select
                  value={downloadClientId?.toString() ?? "none"}
                  onValueChange={(v) =>
                    setDownloadClientId(v === "none" ? null : Number(v))
                  }
                >
                  <SelectTrigger id="synced-download-client" className="w-full">
                    <SelectValue>
                      {filteredClients.find((c) => c.id === downloadClientId)
                        ?.name ?? "(Any)"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(Any)</SelectItem>
                    {filteredClients.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={loading}
                onClick={() => onSave(indexer.id, downloadClientId)}
              >
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
