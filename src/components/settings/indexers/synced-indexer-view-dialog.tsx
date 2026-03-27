import { useState, useEffect } from "react";
import type { JSX } from "react";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import {
  Dialog,
  DialogBody,
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
  onSave: (
    id: number,
    downloadClientId: number | null,
    tag: string | null,
    requestInterval: number,
    dailyQueryLimit: number,
    dailyGrabLimit: number,
  ) => void;
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
  const [tag, setTag] = useState("");
  const [requestInterval, setRequestInterval] = useState(5);
  const [dailyQueryLimit, setDailyQueryLimit] = useState(0);
  const [dailyGrabLimit, setDailyGrabLimit] = useState(0);

  useEffect(() => {
    if (indexer) {
      setDownloadClientId(indexer.downloadClientId ?? null);
      setTag(indexer.tag ?? "");
      setRequestInterval((indexer.requestInterval ?? 5000) / 1000);
      setDailyQueryLimit(indexer.dailyQueryLimit ?? 0);
      setDailyGrabLimit(indexer.dailyGrabLimit ?? 0);
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

        <DialogBody>
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
                    <SelectTrigger
                      id="synced-download-client"
                      className="w-full"
                    >
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

              {/* Tag — editable */}
              <div className="space-y-2">
                <Label htmlFor="synced-tag">
                  Tag{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="synced-tag"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder=""
                />
              </div>

              {/* Rate Limiting */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Rate Limiting
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="synced-requestInterval">
                      Request Interval (s)
                    </Label>
                    <Input
                      id="synced-requestInterval"
                      type="number"
                      min={1}
                      value={requestInterval}
                      onChange={(e) =>
                        setRequestInterval(Number(e.target.value))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum delay between requests
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="synced-dailyQueryLimit">
                      Daily Query Limit
                    </Label>
                    <Input
                      id="synced-dailyQueryLimit"
                      type="number"
                      min={0}
                      value={dailyQueryLimit}
                      onChange={(e) =>
                        setDailyQueryLimit(Number(e.target.value))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Max API hits per day (0 = unlimited)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="synced-dailyGrabLimit">
                      Daily Grab Limit
                    </Label>
                    <Input
                      id="synced-dailyGrabLimit"
                      type="number"
                      min={0}
                      value={dailyGrabLimit}
                      onChange={(e) =>
                        setDailyGrabLimit(Number(e.target.value))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Max grabs per day (0 = unlimited)
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Check your indexer&apos;s account settings for your API
                  limits.
                </p>
              </div>

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
                  onClick={() =>
                    onSave(
                      indexer.id,
                      downloadClientId,
                      tag || null,
                      requestInterval * 1000,
                      dailyQueryLimit,
                      dailyGrabLimit,
                    )
                  }
                >
                  {loading ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
