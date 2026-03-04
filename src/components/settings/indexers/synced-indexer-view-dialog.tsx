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
import CategoryMultiSelect from "src/components/shared/category-multi-select";

type SyncedIndexerViewDialogProps = {
  indexer: SyncedIndexer | null;
  onOpenChange: (open: boolean) => void;
};

function parseCategories(raw: string | null): number[] {
  try {
    return JSON.parse(raw ?? "[]") as number[];
  } catch {
    return [];
  }
}

export default function SyncedIndexerViewDialog({
  indexer,
  onOpenChange,
}: SyncedIndexerViewDialogProps): JSX.Element {
  return (
    <Dialog open={indexer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Synced Indexer</DialogTitle>
          <DialogDescription>
            This indexer is managed by Prowlarr and cannot be edited here.
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
