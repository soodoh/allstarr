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
import { createDownloadProfileSchema } from "src/lib/validators";
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
import LanguageSingleSelect from "src/components/shared/language-single-select";

type DownloadProfileFormProps = {
  initialValues?: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[];
    upgradeAllowed: boolean;
    categories: number[];
    type: string;
    language: string;
  };
  downloadFormats: Array<{ id: number; title: string; type: string }>;
  serverCwd: string;
  onSubmit: (values: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[];
    upgradeAllowed: boolean;
    categories: number[];
    type: string;
    language: string;
  }) => void;
  onCancel: () => void;
  loading?: boolean;
  serverError?: string;
};

function FormatSearchDropdown({
  downloadFormats,
  selectedIds,
  onAdd,
}: {
  downloadFormats: Array<{ id: number; title: string; type: string }>;
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
    return downloadFormats.filter((def) => {
      if (selectedSet.has(def.id)) {
        return false;
      }
      if (!search) {
        return true;
      }
      return def.title.toLowerCase().includes(search.toLowerCase());
    });
  }, [downloadFormats, selectedSet, search]);

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
    downloadFormats.length > 0 && selectedIds.length === downloadFormats.length;

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

function SortableFormatItem({
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

type ProfileDefaults = {
  name: string;
  icon: string;
  rootFolderPath: string;
  upgradeAllowed: boolean;
  cutoff: number;
  categories: number[];
  type: string;
  language: string;
};

function getDefaults(
  initialValues: DownloadProfileFormProps["initialValues"],
): ProfileDefaults {
  return {
    name: initialValues?.name ?? "",
    icon: initialValues?.icon ?? "book-open",
    rootFolderPath: initialValues?.rootFolderPath ?? "",
    upgradeAllowed: initialValues?.upgradeAllowed ?? false,
    cutoff: initialValues?.cutoff ?? 0,
    categories: initialValues?.categories ?? [],
    type: initialValues?.type ?? "ebook",
    language: initialValues?.language ?? "en",
  };
}

function buildInitialItems(
  downloadFormats: Array<{ id: number; title: string }>,
  existingItems?: number[],
): number[] {
  const defIds = new Set(downloadFormats.map((d) => d.id));
  const existingIds = existingItems ?? [];

  if (existingIds.length === 0) {
    return downloadFormats.map((d) => d.id);
  }

  return existingIds.filter((id) => defIds.has(id));
}

function UpgradeSection({
  upgradeAllowed,
  cutoff,
  items,
  downloadFormats,
  errors,
  onUpgradeChange,
  onCutoffChange,
}: {
  upgradeAllowed: boolean;
  cutoff: number;
  items: number[];
  downloadFormats: Array<{ id: number; title: string; type: string }>;
  errors: Record<string, string>;
  onUpgradeChange: (v: boolean) => void;
  onCutoffChange: (v: string) => void;
}): JSX.Element {
  const defMap = useMemo(
    () => new Map(downloadFormats.map((d) => [d.id, d.title])),
    [downloadFormats],
  );
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

function QualitiesSection({
  downloadFormats,
  items,
  cutoff,
  upgradeAllowed,
  error,
  onItemsChange,
}: {
  downloadFormats: Array<{ id: number; title: string; type: string }>;
  items: number[];
  cutoff: number;
  upgradeAllowed: boolean;
  error?: string;
  onItemsChange: (
    updater: (prev: number[]) => number[],
    removedId?: number,
  ) => void;
}): JSX.Element {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onItemsChange((prev) => {
        const oldIndex = prev.indexOf(active.id as number);
        const newIndex = prev.indexOf(over.id as number);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const addItem = (id: number) => {
    onItemsChange((prev) => [...prev, id]);
  };

  const removeItem = (id: number) => {
    onItemsChange((prev) => prev.filter((i) => i !== id), id);
  };

  return (
    <div className="space-y-2">
      <Label>File Formats</Label>
      <p className="text-xs text-muted-foreground">
        File formats higher in the list are more preferred. Drag to reorder.
      </p>

      <FormatSearchDropdown
        downloadFormats={downloadFormats}
        selectedIds={items}
        onAdd={addItem}
      />

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
                <SortableFormatItem
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

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function IconSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor="profile-icon">Icon</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="profile-icon" className="w-full">
          <SelectValue>
            {(() => {
              const Icon = getProfileIcon(value);
              return (
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {PROFILE_ICONS[value]}
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
  );
}

function TypeLanguageSection({
  type,
  language,
  onTypeChange,
  onLanguageChange,
}: {
  type: string;
  language: string;
  onTypeChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
}): JSX.Element {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="profile-type">Type</Label>
        <Select value={type} onValueChange={onTypeChange}>
          <SelectTrigger id="profile-type" className="w-full">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ebook">Ebook</SelectItem>
            <SelectItem value="audiobook">Audiobook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-language">Language</Label>
        <LanguageSingleSelect value={language} onChange={onLanguageChange} />
      </div>
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

export default function DownloadProfileForm({
  initialValues,
  downloadFormats,
  serverCwd,
  onSubmit,
  onCancel,
  loading,
  serverError,
}: DownloadProfileFormProps): JSX.Element {
  const defaults = useMemo(() => getDefaults(initialValues), [initialValues]);
  const [name, setName] = useState(defaults.name);
  const [icon, setIcon] = useState(defaults.icon);
  const [rootFolderPath, setRootFolderPath] = useState(defaults.rootFolderPath);
  const [upgradeAllowed, setUpgradeAllowed] = useState(defaults.upgradeAllowed);
  const [cutoff, setCutoff] = useState(defaults.cutoff);
  const [categories, setCategories] = useState<number[]>(defaults.categories);
  const [type, setType] = useState(defaults.type);
  const [language, setLanguage] = useState(defaults.language);

  const filteredFormats = useMemo(
    () => downloadFormats.filter((d) => d.type === type),
    [downloadFormats, type],
  );

  const [items, setItems] = useState<number[]>(() =>
    buildInitialItems(downloadFormats, initialValues?.items),
  );

  const handleTypeChange = (newType: string) => {
    setType(newType);
    const validIds = new Set(
      downloadFormats.filter((d) => d.type === newType).map((d) => d.id),
    );
    setItems((prev) => prev.filter((id) => validIds.has(id)));
    setCutoff(0);
  };

  const handleItemsChange = (
    updater: (prev: number[]) => number[],
    removedId?: number,
  ) => {
    setItems(updater);
    if (removedId !== undefined && cutoff === removedId) {
      setCutoff(0);
    }
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = validateForm(createDownloadProfileSchema, {
      name,
      icon,
      rootFolderPath,
      cutoff: upgradeAllowed ? cutoff : 0,
      items,
      upgradeAllowed,
      categories,
      type,
      language,
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
      <TypeLanguageSection
        type={type}
        language={language}
        onTypeChange={handleTypeChange}
        onLanguageChange={setLanguage}
      />

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

      <IconSelect value={icon} onChange={setIcon} />

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
        downloadFormats={filteredFormats}
        errors={errors}
        onUpgradeChange={setUpgradeAllowed}
        onCutoffChange={(v) => setCutoff(Number(v))}
      />

      <QualitiesSection
        downloadFormats={filteredFormats}
        items={items}
        cutoff={cutoff}
        upgradeAllowed={upgradeAllowed}
        error={errors.items}
        onItemsChange={handleItemsChange}
      />

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
