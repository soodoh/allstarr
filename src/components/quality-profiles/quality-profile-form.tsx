import { useMemo, useState } from "react";
import type { FormEvent, JSX } from "react";
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
import { GripVertical } from "lucide-react";
import {
  PROFILE_ICONS,
  PROFILE_ICON_MAP,
  getProfileIcon,
} from "src/lib/profile-icons";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import Switch from "src/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

type QualityItem = {
  quality: { id: number; name: string };
  allowed: boolean;
};

type QualityProfileFormProps = {
  initialValues?: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: QualityItem[];
    upgradeAllowed: boolean;
  };
  qualityDefinitions: Array<{ id: number; title: string }>;
  rootFolders: Array<{ id: number; path: string }>;
  onSubmit: (values: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: QualityItem[];
    upgradeAllowed: boolean;
  }) => void;
  onCancel: () => void;
  loading?: boolean;
};

function SortableQualityItem({
  item,
  isCutoff,
  onToggle,
}: {
  item: QualityItem;
  isCutoff: boolean;
  onToggle: () => void;
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.quality.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
        isDragging ? "opacity-50" : ""
      } ${isCutoff ? "border-blue-500 bg-blue-500/10" : "border-border"}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox checked={item.allowed} onCheckedChange={onToggle} />
      <span className="text-sm">{item.quality.name}</span>
      {isCutoff && (
        <span className="ml-auto text-xs text-blue-400">Upgrade Until</span>
      )}
    </div>
  );
}

export default function QualityProfileForm({
  initialValues,
  qualityDefinitions,
  rootFolders,
  onSubmit,
  onCancel,
  loading,
}: QualityProfileFormProps): JSX.Element {
  const [name, setName] = useState(initialValues?.name || "");
  const [icon, setIcon] = useState(initialValues?.icon ?? "book-open");
  const [rootFolderPath, setRootFolderPath] = useState(
    initialValues?.rootFolderPath || "",
  );
  const [upgradeAllowed, setUpgradeAllowed] = useState(
    initialValues?.upgradeAllowed || false,
  );
  const [cutoff, setCutoff] = useState(initialValues?.cutoff || 0);

  // Build initial items: use existing profile items, then append any missing
  // quality definitions at the bottom as unchecked
  const buildInitialItems = (): QualityItem[] => {
    const existing = initialValues?.items || [];
    const existingIds = new Set(existing.map((i) => i.quality.id));
    const missing = qualityDefinitions
      .filter((def) => !existingIds.has(def.id))
      .map((def) => ({
        quality: { id: def.id, name: def.title },
        allowed: false,
      }));
    if (existing.length === 0) {
      // No existing profile — use all definitions in definition order, all checked
      return qualityDefinitions.map((def) => ({
        quality: { id: def.id, name: def.title },
        allowed: true,
      }));
    }
    return [...existing, ...missing];
  };

  const [items, setItems] = useState<QualityItem[]>(buildInitialItems);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortableIds = useMemo(() => items.map((i) => i.quality.id), [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.quality.id === active.id);
        const newIndex = prev.findIndex((i) => i.quality.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleToggleItem = (qualityId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.quality.id === qualityId
          ? { ...item, allowed: !item.allowed }
          : item,
      ),
    );
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = "Name is required";
    }
    if (!rootFolderPath) {
      errs.rootFolderPath = "Root folder is required";
    }
    if (!items.some((i) => i.allowed)) {
      errs.items = "At least one quality must be enabled";
    }
    if (upgradeAllowed && !cutoff) {
      errs.cutoff = "Upgrade cutoff quality is required";
    }
    return errs;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      return;
    }
    onSubmit({
      name,
      icon,
      rootFolderPath,
      cutoff: upgradeAllowed ? cutoff : 0,
      items,
      upgradeAllowed,
    });
  };

  const allowedItems = items.filter((i) => i.allowed);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Profile name"
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-icon">Icon</Label>
        <Select value={icon} onValueChange={setIcon}>
          <SelectTrigger id="profile-icon" className="w-full">
            <SelectValue>
              {(() => {
                const Icon = getProfileIcon(icon);
                return (
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {PROFILE_ICONS[icon]}
                  </span>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROFILE_ICONS).map(([key, label]) => {
              const Icon = PROFILE_ICON_MAP[key];
              return (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="root-folder">Root Folder</Label>
        <Select value={rootFolderPath} onValueChange={setRootFolderPath}>
          <SelectTrigger id="root-folder" className="w-full">
            <SelectValue placeholder="Select root folder" />
          </SelectTrigger>
          <SelectContent>
            {rootFolders.map((f) => (
              <SelectItem key={f.id} value={f.path}>
                {f.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.rootFolderPath && (
          <p className="text-sm text-destructive">{errors.rootFolderPath}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="upgrade-allowed"
          checked={upgradeAllowed}
          onCheckedChange={setUpgradeAllowed}
        />
        <Label htmlFor="upgrade-allowed">Upgrades Allowed</Label>
      </div>

      {upgradeAllowed && (
        <div className="space-y-2">
          <Label htmlFor="upgrade-until">Upgrade Until</Label>
          <Select
            value={cutoff ? String(cutoff) : ""}
            onValueChange={(v) => setCutoff(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select cutoff quality" />
            </SelectTrigger>
            <SelectContent>
              {allowedItems.map((item) => (
                <SelectItem
                  key={item.quality.id}
                  value={String(item.quality.id)}
                >
                  {item.quality.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Once this quality is reached, no further upgrades will be
            downloaded.
          </p>
          {errors.cutoff && (
            <p className="text-sm text-destructive">{errors.cutoff}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Qualities</Label>
        <p className="text-xs text-muted-foreground">
          Qualities higher in the list are more preferred. Drag to reorder.
        </p>
        <div className="space-y-1 rounded-md border border-border p-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item) => (
                <SortableQualityItem
                  key={item.quality.id}
                  item={item}
                  isCutoff={upgradeAllowed && cutoff === item.quality.id}
                  onToggle={() => handleToggleItem(item.quality.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        {errors.items && (
          <p className="text-sm text-destructive">{errors.items}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
