import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, JSX } from "react";
import { toast } from "sonner";
import { AlertTriangle, FolderOpen, Loader2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import DirectoryBrowserDialog from "src/components/shared/directory-browser-dialog";
import CategoryMultiSelect from "src/components/shared/category-multi-select";
import LanguageSingleSelect from "src/components/shared/language-single-select";
import TierGroupList from "src/components/settings/download-profiles/tier-group-list";
import CFScoreSection from "src/components/settings/custom-formats/cf-score-section";
import {
  countProfileFilesFn,
  moveProfileFilesFn,
} from "src/server/download-profiles";

type DownloadProfileFormProps = {
  initialValues?: {
    id: number;
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[][];
    upgradeAllowed: boolean;
    categories: number[];
    mediaType: string;
    contentType: string;
    language: string;
    minCustomFormatScore: number;
    upgradeUntilCustomFormatScore: number;
  };
  downloadFormats: Array<{ id: number; title: string; type: string }>;
  serverCwd: string;
  onSubmit: (values: {
    name: string;
    icon: string;
    rootFolderPath: string;
    cutoff: number;
    items: number[][];
    upgradeAllowed: boolean;
    categories: number[];
    mediaType: string;
    contentType: string;
    language: string;
    minCustomFormatScore: number;
    upgradeUntilCustomFormatScore: number;
  }) => void;
  onSubmitWithId?: (
    values: {
      name: string;
      icon: string;
      rootFolderPath: string;
      cutoff: number;
      items: number[][];
      upgradeAllowed: boolean;
      categories: number[];
      mediaType: string;
      contentType: string;
      language: string;
      minCustomFormatScore: number;
      upgradeUntilCustomFormatScore: number;
    },
    localCFScores: Array<{ customFormatId: number; score: number }>,
  ) => void;
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

type ProfileDefaults = {
  name: string;
  icon: string;
  rootFolderPath: string;
  upgradeAllowed: boolean;
  cutoff: number;
  categories: number[];
  mediaType: string;
  contentType: string;
  language: string;
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
};

const PROFILE_DEFAULTS: ProfileDefaults = {
  name: "",
  icon: "book-open",
  rootFolderPath: "",
  upgradeAllowed: false,
  cutoff: 0,
  categories: [],
  mediaType: "ebook",
  contentType: "book",
  language: "en",
  minCustomFormatScore: 0,
  upgradeUntilCustomFormatScore: 0,
};

function getDefaults(
  initialValues: DownloadProfileFormProps["initialValues"],
): ProfileDefaults {
  if (!initialValues) {
    return PROFILE_DEFAULTS;
  }
  return {
    name: initialValues.name,
    icon: initialValues.icon,
    rootFolderPath: initialValues.rootFolderPath,
    upgradeAllowed: initialValues.upgradeAllowed,
    cutoff: initialValues.cutoff,
    categories: initialValues.categories,
    mediaType: initialValues.mediaType,
    contentType: initialValues.contentType,
    language: initialValues.language,
    minCustomFormatScore: initialValues.minCustomFormatScore,
    upgradeUntilCustomFormatScore: initialValues.upgradeUntilCustomFormatScore,
  };
}

function buildInitialItems(
  downloadFormats: Array<{ id: number; title: string }>,
  existingItems?: number[][],
): number[][] {
  const defIds = new Set(downloadFormats.map((d) => d.id));

  if (!existingItems || existingItems.flat().length === 0) {
    return downloadFormats.map((d) => [d.id]);
  }

  // Filter out invalid format IDs and remove empty groups
  return existingItems
    .map((group) => group.filter((id) => defIds.has(id)))
    .filter((group) => group.length > 0);
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
  items: number[][];
  downloadFormats: Array<{ id: number; title: string; type: string }>;
  errors: Record<string, string>;
  onUpgradeChange: (v: boolean) => void;
  onCutoffChange: (v: string) => void;
}): JSX.Element {
  const defMap = useMemo(
    () => new Map(downloadFormats.map((d) => [d.id, d.title])),
    [downloadFormats],
  );
  const flatItems = useMemo(() => items.flat(), [items]);
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
              {flatItems.map((id) => (
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
  onRemoveFormat,
}: {
  downloadFormats: Array<{ id: number; title: string; type: string }>;
  items: number[][];
  cutoff: number;
  upgradeAllowed: boolean;
  error?: string;
  onItemsChange: (items: number[][]) => void;
  onRemoveFormat: (formatId: number) => void;
}): JSX.Element {
  const flatItems = useMemo(() => items.flat(), [items]);

  const addItem = (id: number) => {
    onItemsChange([...items, [id]]);
  };

  return (
    <div className="space-y-2">
      <Label>File Formats</Label>
      <p className="text-xs text-muted-foreground">
        Formats higher in the list are more preferred. Drag to reorder. Use the
        merge button to group equivalent formats into tiers.
      </p>

      <FormatSearchDropdown
        downloadFormats={downloadFormats}
        selectedIds={flatItems}
        onAdd={addItem}
      />

      <TierGroupList
        items={items}
        onChange={onItemsChange}
        downloadFormats={downloadFormats}
        cutoff={cutoff}
        upgradeAllowed={upgradeAllowed}
        onRemoveFormat={onRemoveFormat}
      />

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

function ContentMediaSection({
  contentType,
  mediaType,
  language,
  onContentTypeChange,
  onMediaTypeChange,
  onLanguageChange,
}: {
  contentType: string;
  mediaType: string;
  language: string;
  onContentTypeChange: (v: string) => void;
  onMediaTypeChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
}): JSX.Element {
  const isBookContent = contentType === "book";

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="profile-content-type">Content Type</Label>
        <Select value={contentType} onValueChange={onContentTypeChange}>
          <SelectTrigger id="profile-content-type" className="w-full">
            <SelectValue placeholder="Select content type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="book">Book</SelectItem>
            <SelectItem value="tv">TV</SelectItem>
            <SelectItem value="movie">Movie</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-media-type">Media Type</Label>
        <Select
          value={mediaType}
          onValueChange={onMediaTypeChange}
          disabled={!isBookContent}
        >
          <SelectTrigger id="profile-media-type" className="w-full">
            <SelectValue placeholder="Select media type" />
          </SelectTrigger>
          <SelectContent>
            {isBookContent ? (
              <>
                <SelectItem value="ebook">Ebook</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
              </>
            ) : (
              <SelectItem value="video">Video</SelectItem>
            )}
          </SelectContent>
        </Select>
        {!isBookContent && (
          <p className="text-xs text-muted-foreground">
            Media type is fixed to Video for TV and Movie content.
          </p>
        )}
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
  onSubmitWithId,
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
  const [mediaType, setMediaType] = useState(defaults.mediaType);
  const [contentType, setContentType] = useState(defaults.contentType);
  const [language, setLanguage] = useState(defaults.language);
  const [minCustomFormatScore, setMinCustomFormatScore] = useState(
    defaults.minCustomFormatScore,
  );
  const [upgradeUntilCustomFormatScore, setUpgradeUntilCustomFormatScore] =
    useState(defaults.upgradeUntilCustomFormatScore);
  const [localCFScores, setLocalCFScores] = useState<
    Array<{ customFormatId: number; score: number }>
  >([]);

  // Root folder move confirmation state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveFileCount, setMoveFileCount] = useState(0);
  const [moveLoading, setMoveLoading] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<
    Parameters<typeof onSubmit>[0] | null
  >(null);

  const filteredFormats = useMemo(
    () => downloadFormats.filter((d) => d.type === mediaType),
    [downloadFormats, mediaType],
  );

  const [items, setItems] = useState<number[][]>(() =>
    buildInitialItems(downloadFormats, initialValues?.items),
  );

  const handleContentTypeChange = (newContentType: string) => {
    setContentType(newContentType);
    let newMediaType: string;
    if (newContentType === "tv" || newContentType === "movie") {
      newMediaType = "video";
    } else {
      newMediaType = "ebook";
    }
    setMediaType(newMediaType);
    const validIds = new Set(
      downloadFormats.filter((d) => d.type === newMediaType).map((d) => d.id),
    );
    setItems((prev) =>
      prev
        .map((group) => group.filter((id) => validIds.has(id)))
        .filter((group) => group.length > 0),
    );
    setCutoff(0);
  };

  const handleMediaTypeChange = (newMediaType: string) => {
    setMediaType(newMediaType);
    const validIds = new Set(
      downloadFormats.filter((d) => d.type === newMediaType).map((d) => d.id),
    );
    setItems((prev) =>
      prev
        .map((group) => group.filter((id) => validIds.has(id)))
        .filter((group) => group.length > 0),
    );
    setCutoff(0);
  };

  const handleItemsChange = (newItems: number[][]) => {
    setItems(newItems);
  };

  const handleRemoveFormat = (formatId: number) => {
    setItems((prev) => {
      const updated = prev
        .map((group) => group.filter((id) => id !== formatId))
        .filter((group) => group.length > 0);
      return updated;
    });
    if (cutoff === formatId) {
      setCutoff(0);
    }
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = initialValues?.id !== undefined;
  const rootFolderChanged =
    isEditing && rootFolderPath !== initialValues.rootFolderPath;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = validateForm(createDownloadProfileSchema, {
      name,
      icon,
      rootFolderPath,
      cutoff: upgradeAllowed ? cutoff : 0,
      items,
      upgradeAllowed,
      categories,
      mediaType,
      contentType,
      language,
      minCustomFormatScore,
      upgradeUntilCustomFormatScore,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    // If root folder changed on an existing profile, check for files to move
    if (rootFolderChanged && initialValues.rootFolderPath) {
      try {
        const { count } = await countProfileFilesFn({
          data: { profileId: initialValues.id },
        });
        if (count > 0) {
          setPendingFormData(result.data);
          setMoveFileCount(count);
          setMoveDialogOpen(true);
          return;
        }
      } catch {
        // If count fails, just save without moving
      }
    }

    // For new profiles with local CF scores, use the two-step callback
    if (!isEditing && onSubmitWithId && localCFScores.length > 0) {
      onSubmitWithId(result.data, localCFScores);
    } else {
      onSubmit(result.data);
    }
  };

  const handleMoveFiles = async () => {
    if (!pendingFormData || !initialValues?.id) {
      return;
    }
    setMoveLoading(true);
    try {
      const result = await moveProfileFilesFn({
        data: {
          profileId: initialValues.id,
          oldRootFolder: initialValues.rootFolderPath,
          newRootFolder: rootFolderPath,
        },
      });
      if (result.errors.length > 0) {
        toast.success(
          `Moved ${result.movedCount} file${result.movedCount === 1 ? "" : "s"} with ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`,
        );
      } else {
        toast.success(
          `Moved ${result.movedCount} file${result.movedCount === 1 ? "" : "s"}`,
        );
      }
    } catch (error) {
      toast.error(
        `Failed to move files: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setMoveLoading(false);
      setMoveDialogOpen(false);
      onSubmit(pendingFormData);
      setPendingFormData(null);
    }
  };

  const handleSkipMove = () => {
    if (!pendingFormData) {
      return;
    }
    setMoveDialogOpen(false);
    onSubmit(pendingFormData);
    setPendingFormData(null);
  };

  const handleCancelMove = () => {
    setMoveDialogOpen(false);
    setPendingFormData(null);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ContentMediaSection
          contentType={contentType}
          mediaType={mediaType}
          language={language}
          onContentTypeChange={handleContentTypeChange}
          onMediaTypeChange={handleMediaTypeChange}
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
          onRemoveFormat={handleRemoveFormat}
        />

        <CFScoreSection
          profileId={initialValues?.id}
          contentType={contentType}
          mediaType={mediaType}
          minCustomFormatScore={minCustomFormatScore}
          upgradeUntilCustomFormatScore={upgradeUntilCustomFormatScore}
          onMinScoreChange={setMinCustomFormatScore}
          onUpgradeUntilScoreChange={setUpgradeUntilCustomFormatScore}
          localScores={
            initialValues?.id === undefined ? localCFScores : undefined
          }
          onLocalScoresChange={
            initialValues?.id === undefined ? setLocalCFScores : undefined
          }
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

      <Dialog open={moveDialogOpen} onOpenChange={handleCancelMove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Files?</DialogTitle>
            <DialogDescription>
              The root folder path has changed. Would you like to move existing
              files to the new location?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border p-3 space-y-2">
              <div>
                <span className="text-muted-foreground">From: </span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {initialValues?.rootFolderPath}
                </code>
              </div>
              <div>
                <span className="text-muted-foreground">To: </span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {rootFolderPath}
                </code>
              </div>
            </div>

            <p>
              <strong>{moveFileCount}</strong> file
              {moveFileCount === 1 ? "" : "s"} will be moved.
            </p>

            <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                This operation may take a while for large libraries. Files will
                be physically moved on disk.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleCancelMove}
              disabled={moveLoading}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={handleSkipMove}
              disabled={moveLoading}
            >
              Don&apos;t Move
            </Button>
            <Button onClick={handleMoveFiles} disabled={moveLoading}>
              {moveLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Moving...
                </>
              ) : (
                "Move Files"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
