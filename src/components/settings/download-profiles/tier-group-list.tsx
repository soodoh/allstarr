import { useMemo } from "react";
import type { JSX } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Equal, GripVertical, Merge, Split, X } from "lucide-react";
import { cn } from "src/lib/utils";
import { Button } from "src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/ui/tooltip";

type TierGroupListProps = {
  items: number[][];
  onChange: (items: number[][]) => void;
  downloadFormats: Array<{ id: number; title: string; type: string }>;
  cutoff: number;
  upgradeAllowed: boolean;
  onRemoveFormat: (formatId: number) => void;
};

/** Unique string key for a group so dnd-kit can track it, based on contents. */
function groupKey(group: number[]): string {
  return `group-${group.join("-")}`;
}

function SortableGroup({
  id,
  groupIndex,
  group,
  defMap,
  cutoff,
  upgradeAllowed,
  isFirst,
  onRemoveFormat,
  onMergeUp,
  onSplitGroup,
}: {
  id: string;
  groupIndex: number;
  group: number[];
  defMap: Map<number, string>;
  cutoff: number;
  upgradeAllowed: boolean;
  isFirst: boolean;
  onRemoveFormat: (formatId: number) => void;
  onMergeUp: (groupIndex: number) => void;
  onSplitGroup: (groupIndex: number) => void;
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isMulti = group.length > 1;
  const hasCutoff = upgradeAllowed && group.some((id) => cutoff === id);

  function getBorderClass(): string {
    if (hasCutoff && isMulti) {
      return "border-blue-500 bg-blue-500/5";
    }
    if (hasCutoff) {
      return "border-blue-500 bg-blue-500/10";
    }
    return "border-border";
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2",
        isDragging && "opacity-50",
        getBorderClass(),
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Group content */}
      <div className="flex-1 min-w-0">
        {isMulti ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Equal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {group.map((formatId, idx) => {
              const isCutoff = upgradeAllowed && cutoff === formatId;
              return (
                <div key={formatId} className="flex items-center gap-1">
                  {idx > 0 && (
                    <span className="text-xs text-muted-foreground">=</span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm",
                      isCutoff
                        ? "border-blue-500 bg-blue-500/20 text-blue-400"
                        : "border-border bg-muted/50",
                    )}
                  >
                    {defMap.get(formatId) ?? String(formatId)}
                    {isCutoff && (
                      <span className="text-[10px] text-blue-400 ml-0.5">
                        Cutoff
                      </span>
                    )}
                    <button
                      type="button"
                      className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => onRemoveFormat(formatId)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={cn("text-sm", hasCutoff && "text-blue-400")}>
              {defMap.get(group[0]) ?? String(group[0])}
            </span>
            {hasCutoff && (
              <span className="text-xs text-blue-400">Upgrade Until</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <TooltipProvider delayDuration={300}>
          {/* Merge with group above */}
          {!isFirst && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onMergeUp(groupIndex)}
                >
                  <Merge className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Merge with group above</TooltipContent>
            </Tooltip>
          )}

          {/* Split group */}
          {isMulti && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onSplitGroup(groupIndex)}
                >
                  <Split className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Split into individual items</TooltipContent>
            </Tooltip>
          )}

          {/* Remove (single item groups) */}
          {!isMulti && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onRemoveFormat(group[0])}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}

export default function TierGroupList({
  items,
  onChange,
  downloadFormats,
  cutoff,
  upgradeAllowed,
  onRemoveFormat,
}: TierGroupListProps): JSX.Element {
  const defMap = useMemo(
    () => new Map(downloadFormats.map((d) => [d.id, d.title])),
    [downloadFormats],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const groupIds = useMemo(
    () => items.map((group) => groupKey(group)),
    [items],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = groupIds.indexOf(active.id as string);
    const newIndex = groupIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    onChange(arrayMove([...items], oldIndex, newIndex));
  };

  const handleMergeUp = (groupIndex: number) => {
    if (groupIndex === 0) {
      return;
    }
    const newItems = [...items];
    const merged = [...newItems[groupIndex - 1], ...newItems[groupIndex]];
    newItems.splice(groupIndex - 1, 2, merged);
    onChange(newItems);
  };

  const handleSplitGroup = (groupIndex: number) => {
    const group = items[groupIndex];
    if (group.length <= 1) {
      return;
    }
    const newItems = [...items];
    const individuals = group.map((id) => [id]);
    newItems.splice(groupIndex, 1, ...individuals);
    onChange(newItems);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        No formats added. Use the search above to add formats.
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={groupIds}
          strategy={verticalListSortingStrategy}
        >
          {items.map((group, idx) => (
            <SortableGroup
              key={groupKey(group)}
              id={groupKey(group)}
              groupIndex={idx}
              group={group}
              defMap={defMap}
              cutoff={cutoff}
              upgradeAllowed={upgradeAllowed}
              isFirst={idx === 0}
              onRemoveFormat={onRemoveFormat}
              onMergeUp={handleMergeUp}
              onSplitGroup={handleSplitGroup}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
