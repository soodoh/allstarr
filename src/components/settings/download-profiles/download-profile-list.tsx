import { useState } from "react";
import type { JSX } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { getProfileIcon } from "src/lib/profile-icons";
import { CATEGORY_MAP } from "src/lib/categories";
import COLOR_BADGE_CLASSES from "src/lib/format-colors";
import { Button } from "src/components/ui/button";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
  rootFolderPath: string;
  cutoff: number;
  items: number[];
  upgradeAllowed: boolean;
  categories: number[];
};

type FormatDefinition = {
  id: number;
  title: string;
  color: string;
};

type DownloadProfileListProps = {
  profiles: DownloadProfile[];
  definitions: FormatDefinition[];
  onEdit: (profile: DownloadProfile) => void;
  onDelete: (id: number) => void;
};

export default function DownloadProfileList({
  profiles,
  definitions,
  onEdit,
  onDelete,
}: DownloadProfileListProps): JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<DownloadProfile | null>(
    null,
  );

  const defById = new Map(definitions.map((d) => [d.id, d]));

  if (profiles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No download profiles found. Create one to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Root Folder</TableHead>
            <TableHead>Formats</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>Upgrades</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((profile) => {
            const itemIds = profile.items;
            const cutoffDef = profile.cutoff
              ? defById.get(profile.cutoff)
              : null;
            return (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">
                  {(() => {
                    const Icon = getProfileIcon(profile.icon);
                    return (
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {profile.name}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-0">
                  <div className="truncate text-left font-mono" dir="rtl">
                    <bdo dir="ltr" title={profile.rootFolderPath}>
                      {profile.rootFolderPath || "—"}
                    </bdo>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {itemIds.map((id) => {
                      const def = defById.get(id);
                      if (!def) {
                        return null;
                      }
                      const isCutoff = profile.cutoff === id;
                      let badgeClass = "";
                      if (isCutoff) {
                        badgeClass =
                          "border-blue-500 bg-blue-500/20 text-blue-400";
                      } else if (def.color) {
                        badgeClass = COLOR_BADGE_CLASSES[def.color] ?? "";
                      }
                      return (
                        <Badge
                          key={id}
                          variant="secondary"
                          className={badgeClass}
                        >
                          {def.title}
                        </Badge>
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {profile.categories.map((catId) => (
                      <Badge key={catId} variant="outline">
                        {CATEGORY_MAP.get(catId) ?? String(catId)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    if (!profile.upgradeAllowed) {
                      return "No";
                    }
                    if (cutoffDef) {
                      return `Until ${cutoffDef.title}`;
                    }
                    return "Yes";
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(profile)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(profile)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete Profile"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
