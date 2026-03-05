import { useEffect, useMemo, useRef, useState } from "react";
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
import { FolderOpen, GripVertical, X } from "lucide-react";
import {
  PROFILE_ICONS,
  PROFILE_ICON_MAP,
  getProfileIcon,
} from "src/lib/profile-icons";
import validateForm from "src/lib/form-validation";
import { createQualityProfileSchema } from "src/lib/validators";
import { cn } from "src/lib/utils";
import { Button } from "src/components/ui/button";
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
import DirectoryBrowserDialog from "src/components/shared/directory-browser-dialog";
import CategoryMultiSelect from "src/components/shared/category-multi-select";

type QualityProfileFormProps = {
  initialValues?: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[];
    upgradeAllowed: boolean;
    categories: number[];
  };
  qualityDefinitions: Array<{ id: number; title: string }>;
  serverCwd: string;
  onSubmit: (values: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[];
    upgradeAllowed: boolean;
    categories: number[];
  }) => void;
  onCancel: () => void;
  loading?: boolean;
  serverError?: string;
};

function FormatSearchDropdown({
  qualityDefinitions,
  selectedIds,
  onAdd,
}: {
  qualityDefinitions: Array<{ id: number; title: string }>;
  selectedIds: number[];
  onAdd: (id: number) => void;
}): JSX.Element {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const availableItems = useMemo(() => {
    return qualityDefinitions.filter((def) => {
      if (selectedSet.has(def.id)) {
        return false;
      }
      if (!search) {
        return true;
      }
      return def.title.toLowerCase().includes(search.toLowerCase());
    });
  }, [qualityDefinitions, selectedSet, search]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  useEffect(() => {
    if (!dropdownOpen || !listRef.current) {
      return;
    }
    const els = listRef.current.querySelectorAll("[data-item]");
    const target = els[highlightIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, dropdownOpen]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const addItem = (id: number) => {
    onAdd(id);
    setSearch("");
    setHighlightIndex(0);
    searchInputRef.current?.focus();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, availableItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (availableItems[highlightIndex]) {
        addItem(availableItems[highlightIndex].id);
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      searchInputRef.current?.blur();
    }
  };

  const allAdded =
    qualityDefinitions.length > 0 &&
    selectedIds.length === qualityDefinitions.length;

  return (
    <div ref={dropdownContainerRef} className="relative">
      <input
        ref={searchInputRef}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!dropdownOpen) {
            setDropdownOpen(true);
          }
        }}
        onFocus={() => setDropdownOpen(true)}
        onKeyDown={handleSearchKeyDown}
        placeholder={
          availableItems.length === 0 && !search
            ? "All formats added"
            : "Add a format..."
        }
        disabled={allAdded}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />

      {dropdownOpen && availableItems.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {availableItems.map((def, i) => (
            <button
              key={def.id}
              type="button"
              data-item
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-default",
                i === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                addItem(def.id);
              }}
            >
              {def.title}
            </button>
          ))}
        </div>
      )}

      {dropdownOpen && search && availableItems.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-center text-sm text-muted-foreground shadow-md">
          No formats found.
        </div>
      )}
    </div>
  );
}

function SortableQualityItem({
  id,
  name,
  isCutoff,
  onRemove,
}: {
  id: number;
  name: string;
  isCutoff: boolean;
  onRemove: () => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2",
        isDragging && "opacity-50",
        isCutoff ? "border-blue-500 bg-blue-500/10" : "border-border",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm">{name}</span>
      {isCutoff && (
        <span className="ml-auto text-xs text-blue-400">Upgrade Until</span>
      )}
      <button
        type="button"
        className={cn(
          "rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground",
          !isCutoff && "ml-auto",
        )}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function buildInitialItems(
  qualityDefinitions: Array<{ id: number; title: string }>,
  existingItems?: number[],
): number[] {
  const defIds = new Set(qualityDefinitions.map((d) => d.id));
  const existingIds = existingItems ?? [];

  if (existingIds.length === 0) {
    return qualityDefinitions.map((d) => d.id);
  }

  return existingIds.filter((id) => defIds.has(id));
}

function UpgradeSection({
  upgradeAllowed,
  cutoff,
  items,
  defMap,
  errors,
  onUpgradeChange,
  onCutoffChange,
}: {
  upgradeAllowed: boolean;
  cutoff: number;
  items: number[];
  defMap: Map<number, string>;
  errors: Record<string, string>;
  onUpgradeChange: (v: boolean) => void;
  onCutoffChange: (v: string) => void;
}): JSX.Element {
  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          id="upgrade-allowed"
          checked={upgradeAllowed}
          onCheckedChange={onUpgradeChange}
        />
        <Label htmlFor="upgrade-allowed">Upgrades Allowed</Label>
      </div>

      {upgradeAllowed && (
        <div className="space-y-2">
          <Label htmlFor="upgrade-until">Upgrade Until</Label>
          <Select
            value={cutoff ? String(cutoff) : ""}
            onValueChange={onCutoffChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select cutoff quality" />
            </SelectTrigger>
            <SelectContent>
              {items.map((id) => (
                <SelectItem key={id} value={String(id)}>
                  {defMap.get(id) ?? String(id)}
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
    </>
  );
}

function RootFolderSection({
  rootFolderPath,
  onPathChange,
  serverCwd,
  error,
  serverError,
}: {
  rootFolderPath: string;
  onPathChange: (path: string) => void;
  serverCwd: string;
  error?: string;
  serverError?: string;
}): JSX.Element {
  const [browseOpen, setBrowseOpen] = useState(false);
  const displayError =
    error || (serverError?.includes("Root folder") ? serverError : undefined);

  return (
    <div className="space-y-2">
      <Label htmlFor="root-folder">Root Folder</Label>
      <div className="flex gap-2">
        <Input
          id="root-folder"
          value={rootFolderPath}
          onChange={(e) => onPathChange(e.target.value)}
          placeholder="/path/to/books"
          className="font-mono"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setBrowseOpen(true)}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
      {displayError && (
        <p className="text-sm text-destructive">{displayError}</p>
      )}
      <DirectoryBrowserDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        initialPath={rootFolderPath || serverCwd}
        onSelect={(path) => {
          onPathChange(path);
          setBrowseOpen(false);
        }}
      />
    </div>
  );
}

export default function QualityProfileForm({
  initialValues,
  qualityDefinitions,
  serverCwd,
  onSubmit,
  onCancel,
  loading,
  serverError,
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
  const [categories, setCategories] = useState<number[]>(
    initialValues?.categories ?? [],
  );

  const [items, setItems] = useState<number[]>(() =>
    buildInitialItems(qualityDefinitions, initialValues?.items),
  );

  const defMap = useMemo(
    () => new Map(qualityDefinitions.map((d) => [d.id, d.title])),
    [qualityDefinitions],
  );

  const addItem = (id: number) => {
    setItems((prev) => [...prev, id]);
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((i) => i !== id));
    if (cutoff === id) {
      setCutoff(0);
    }
  };

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.indexOf(active.id as number);
        const newIndex = prev.indexOf(over.id as number);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = validateForm(createQualityProfileSchema, {
      name,
      icon,
      rootFolderPath,
      cutoff: upgradeAllowed ? cutoff : 0,
      items,
      upgradeAllowed,
      categories,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
  };

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

      <RootFolderSection
        rootFolderPath={rootFolderPath}
        onPathChange={setRootFolderPath}
        serverCwd={serverCwd}
        error={errors.rootFolderPath}
        serverError={serverError}
      />

      <div className="space-y-2">
        <Label>Search Categories</Label>
        <CategoryMultiSelect value={categories} onChange={setCategories} />
        <p className="text-xs text-muted-foreground">
          Newznab/Torznab categories to search when using this profile.
        </p>
      </div>

      <UpgradeSection
        upgradeAllowed={upgradeAllowed}
        cutoff={cutoff}
        items={items}
        defMap={defMap}
        errors={errors}
        onUpgradeChange={setUpgradeAllowed}
        onCutoffChange={(v) => setCutoff(Number(v))}
      />

      <div className="space-y-2">
        <Label>Qualities</Label>
        <p className="text-xs text-muted-foreground">
          Qualities higher in the list are more preferred. Drag to reorder.
        </p>

        <FormatSearchDropdown
          qualityDefinitions={qualityDefinitions}
          selectedIds={items}
          onAdd={addItem}
        />

        {/* Sortable quality list */}
        {items.length > 0 && (
          <div className="space-y-1 rounded-md border border-border p-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items}
                strategy={verticalListSortingStrategy}
              >
                {items.map((id) => (
                  <SortableQualityItem
                    key={id}
                    id={id}
                    name={defMap.get(id) ?? String(id)}
                    isCutoff={upgradeAllowed && cutoff === id}
                    onRemove={() => removeItem(id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {errors.items && (
          <p className="text-sm text-destructive">{errors.items}</p>
        )}
      </div>

      {serverError && !serverError.includes("Root folder") && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

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
