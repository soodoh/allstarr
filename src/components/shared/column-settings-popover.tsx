import { useCallback } from "react";
import type { JSX } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "src/components/ui/popover";
import { Button } from "src/components/ui/button";
import Switch from "src/components/ui/switch";
import { useTableColumns } from "src/hooks/use-table-columns";
import {
  useUpsertTableSettings,
  useResetTableSettings,
} from "src/hooks/mutations/user-table-settings";
import type { TableId, TableColumnDef } from "src/lib/table-column-defaults";

function SortableColumnItem({
  column,
  visible,
  onToggle,
}: {
  column: TableColumnDef;
  visible: boolean;
  onToggle: () => void;
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        isDragging ? "bg-muted opacity-50" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm">{column.label}</span>
      {column.locked ? (
        <span className="text-xs text-muted-foreground">Always</span>
      ) : (
        <Switch size="sm" checked={visible} onCheckedChange={onToggle} />
      )}
    </div>
  );
}

export default function ColumnSettingsPopover({
  tableId,
}: {
  tableId: TableId;
}): JSX.Element {
  const { allColumns, hiddenKeys, columnOrder, hiddenColumnKeys } =
    useTableColumns(tableId);
  const upsert = useUpsertTableSettings();
  const reset = useResetTableSettings();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const persist = useCallback(
    (newOrder: string[], newHidden: string[]) => {
      upsert.mutate({
        tableId,
        columnOrder: newOrder,
        hiddenColumns: newHidden,
      });
    },
    [tableId, upsert],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = columnOrder.indexOf(active.id as string);
      const newIndex = columnOrder.indexOf(over.id as string);
      const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
      persist(newOrder, hiddenColumnKeys);
    },
    [columnOrder, hiddenColumnKeys, persist],
  );

  const handleToggle = useCallback(
    (key: string) => {
      const newHidden = hiddenKeys.has(key)
        ? hiddenColumnKeys.filter((k) => k !== key)
        : [...hiddenColumnKeys, key];
      persist(columnOrder, newHidden);
    },
    [hiddenKeys, hiddenColumnKeys, columnOrder, persist],
  );

  const handleReset = useCallback(() => {
    reset.mutate({ tableId });
  }, [tableId, reset]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Column settings">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <PopoverHeader className="border-b px-3 py-2">
          <PopoverTitle>Columns</PopoverTitle>
        </PopoverHeader>
        <div className="max-h-80 overflow-y-auto px-2 py-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={columnOrder}
              strategy={verticalListSortingStrategy}
            >
              {allColumns.map((col) => (
                <SortableColumnItem
                  key={col.key}
                  column={col}
                  visible={!hiddenKeys.has(col.key)}
                  onToggle={() => handleToggle(col.key)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <div className="border-t px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={handleReset}
          >
            Reset to defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
