import { useState, useCallback, useEffect } from "react";
import type { JSX } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";
import Slider from "src/components/ui/slider";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import { useUpdateQualityDefinition } from "src/hooks/mutations";

import COLOR_BADGE_CLASSES from "src/lib/format-colors";
import type { qualityDefinitions } from "src/db/schema";

type QualityDefinition = typeof qualityDefinitions.$inferSelect;

type QualityDefinitionListProps = {
  definitions: QualityDefinition[];
  onEdit: (def: QualityDefinition) => void;
  onDelete: (id: number) => void;
};

function isAudioFormat(title: string): boolean {
  return /^(mp3|m4b|flac|aac|ogg|wma|wav)$/i.test(title);
}

function SizeSlider({ def }: { def: QualityDefinition }): JSX.Element {
  const maxRange = isAudioFormat(def.title) ? 5000 : 500;
  const updateDef = useUpdateQualityDefinition();

  const [values, setValues] = useState<[number, number, number]>([
    def.minSize ?? 0,
    def.preferredSize ?? 0,
    def.maxSize ?? 0,
  ]);

  useEffect(() => {
    setValues([def.minSize ?? 0, def.preferredSize ?? 0, def.maxSize ?? 0]);
  }, [def.minSize, def.preferredSize, def.maxSize]);

  const handleChange = useCallback((newValues: number[]) => {
    setValues(newValues as [number, number, number]);
  }, []);

  const handleCommit = useCallback(
    (newValues: number[]) => {
      const [min, preferred, max] = newValues;
      updateDef.mutate({
        id: def.id,
        title: def.title,
        weight: def.weight,
        color: def.color,
        minSize: min,
        preferredSize: preferred,
        maxSize: max,
        specifications: Array.isArray(def.specifications)
          ? def.specifications
          : [],
      });
    },
    [def, updateDef],
  );

  if ((def.maxSize ?? 0) === 0 && def.title === "Unknown") {
    return <span className="text-sm text-muted-foreground">No limit</span>;
  }

  return (
    <div className="flex items-center gap-3 min-w-[250px]">
      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
        {values[0]}
      </span>
      <Slider
        min={0}
        max={maxRange}
        step={1}
        value={values}
        onValueChange={handleChange}
        onValueCommit={handleCommit}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground w-12 tabular-nums">
        {values[2]} MB
      </span>
    </div>
  );
}

export default function QualityDefinitionList({
  definitions,
  onEdit,
  onDelete,
}: QualityDefinitionListProps): JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<QualityDefinition | null>(
    null,
  );

  if (definitions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No quality definitions found. Create one to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Size Limit</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((def) => (
            <TableRow key={def.id}>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    COLOR_BADGE_CLASSES[def.color] ?? COLOR_BADGE_CLASSES.gray
                  }
                >
                  {def.title}
                </Badge>
              </TableCell>
              <TableCell>
                <SizeSlider def={def} />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(def)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(def)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete Quality Definition"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? It will be removed from all quality profiles.`}
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
