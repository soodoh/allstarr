import { useState, useCallback, useEffect, useMemo } from "react";
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
import { useUpdateDownloadFormat } from "src/hooks/mutations";

import {
  computeEffectiveSizes,
  formatEffectiveSize,
} from "src/lib/format-size-calc";
import COLOR_BADGE_CLASSES from "src/lib/format-colors";
import type { downloadFormats } from "src/db/schema";

type DownloadFormat = typeof downloadFormats.$inferSelect;

type DownloadFormatListProps = {
  definitions: DownloadFormat[];
  onEdit: (def: DownloadFormat) => void;
  onDelete: (id: number) => void;
};

function sliderMaxRange(type: string): number {
  if (type === "audio") {
    return 1500;
  }
  if (type === "video") {
    return 2000;
  }
  return 100;
}

function sliderUnit(type: string): string {
  if (type === "audio") {
    return "kbps";
  }
  if (type === "video") {
    return "MB/min";
  }
  return "MB/100pg";
}

function SizeSlider({ def }: { def: DownloadFormat }): JSX.Element {
  const maxRange = sliderMaxRange(def.type);
  const step = def.type === "audio" || def.type === "video" ? 1 : 0.5;
  const unit = sliderUnit(def.type);
  const updateDef = useUpdateDownloadFormat();

  const noLimitMax = Boolean(def.noMaxLimit);
  const noLimitPreferred = Boolean(def.noPreferredLimit);

  const disabledThumbs = useMemo(() => {
    const set = new Set<number>();
    if (noLimitPreferred) {
      set.add(1);
    }
    if (noLimitMax) {
      set.add(2);
    }
    return set;
  }, [noLimitPreferred, noLimitMax]);

  const [values, setValues] = useState<[number, number, number]>([
    def.minSize ?? 0,
    noLimitPreferred ? maxRange : (def.preferredSize ?? maxRange),
    noLimitMax ? maxRange : (def.maxSize ?? maxRange),
  ]);

  useEffect(() => {
    setValues([
      def.minSize ?? 0,
      noLimitPreferred ? maxRange : (def.preferredSize ?? maxRange),
      noLimitMax ? maxRange : (def.maxSize ?? maxRange),
    ]);
  }, [
    def.minSize,
    def.preferredSize,
    def.maxSize,
    maxRange,
    noLimitPreferred,
    noLimitMax,
  ]);

  const handleChange = useCallback(
    (newValues: number[]) => {
      setValues([
        newValues[0],
        noLimitPreferred ? maxRange : newValues[1],
        noLimitMax ? maxRange : newValues[2],
      ] as [number, number, number]);
    },
    [noLimitPreferred, noLimitMax, maxRange],
  );

  const handleCommit = useCallback(
    (newValues: number[]) => {
      const [min, preferred, max] = newValues;
      updateDef.mutate({
        id: def.id,
        title: def.title,
        weight: def.weight,
        color: def.color,
        minSize: min,
        preferredSize: noLimitPreferred
          ? (def.preferredSize ?? maxRange)
          : preferred,
        maxSize: noLimitMax ? (def.maxSize ?? maxRange) : max,
        type: def.type as "ebook" | "audio" | "video",
        source: def.source ?? null,
        resolution: def.resolution ?? 0,
        noMaxLimit: def.noMaxLimit ?? 0,
        noPreferredLimit: def.noPreferredLimit ?? 0,
      });
    },
    [def, updateDef, maxRange, noLimitMax, noLimitPreferred],
  );

  if (noLimitMax && noLimitPreferred && def.title.startsWith("Unknown")) {
    return <span className="text-sm text-muted-foreground">No limit</span>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 min-w-[250px]">
        <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
          {values[0]}
        </span>
        <Slider
          min={0}
          max={maxRange}
          step={step}
          value={values}
          onValueChange={handleChange}
          onValueCommit={handleCommit}
          className="flex-1"
          disabledThumbs={disabledThumbs}
        />
        <span className="text-xs text-muted-foreground w-16 tabular-nums">
          {noLimitMax ? "∞" : values[2]} {unit}
        </span>
      </div>
      <ExampleSizes def={def} />
    </div>
  );
}

type SampleEntry = { label: string; meta: Record<string, number> };

function exampleSamples(type: string): SampleEntry[] {
  if (type === "audio") {
    return [
      { label: "5 hr", meta: { audioLength: 300 } },
      { label: "10 hr", meta: { audioLength: 600 } },
      { label: "20 hr", meta: { audioLength: 1200 } },
    ];
  }
  if (type === "video") {
    return [
      { label: "1 hr", meta: { videoLength: 60 } },
      { label: "2 hr", meta: { videoLength: 120 } },
      { label: "3 hr", meta: { videoLength: 180 } },
    ];
  }
  return [
    { label: "200 pg", meta: { pageCount: 200 } },
    { label: "400 pg", meta: { pageCount: 400 } },
    { label: "800 pg", meta: { pageCount: 800 } },
  ];
}

function ExampleSizes({ def }: { def: DownloadFormat }): JSX.Element | null {
  if (def.title.startsWith("Unknown")) {
    return null;
  }

  const noLimitMax = Boolean(def.noMaxLimit);
  const noLimitPreferred = Boolean(def.noPreferredLimit);
  const samples = exampleSamples(def.type);

  return (
    <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
      {samples.map((s) => {
        const eff = computeEffectiveSizes(
          def.type as "ebook" | "audio" | "video",
          def.minSize ?? 0,
          noLimitMax ? 0 : (def.maxSize ?? 0),
          noLimitPreferred ? 0 : (def.preferredSize ?? 0),
          s.meta,
        );
        return (
          <span key={s.label}>
            <span className="font-medium text-foreground/70">{s.label}:</span>{" "}
            {formatEffectiveSize(eff.minSize, "min")} –{" "}
            {formatEffectiveSize(eff.maxSize)}
          </span>
        );
      })}
    </div>
  );
}

export default function DownloadFormatList({
  definitions,
  onEdit,
  onDelete,
}: DownloadFormatListProps): JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<DownloadFormat | null>(null);

  if (definitions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No download formats found. Create one to get started.
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
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      COLOR_BADGE_CLASSES[def.color] ?? COLOR_BADGE_CLASSES.gray
                    }
                  >
                    {def.title}
                  </Badge>
                </div>
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
        title="Delete Download Format"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? It will be removed from all download profiles.`}
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
