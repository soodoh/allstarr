import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import PageHeader from "src/components/shared/page-header";
import { settingsMapQuery, downloadProfilesListQuery } from "src/lib/queries";
import { useUpdateSettings } from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/media-management")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(settingsMapQuery()),
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
    ]);
  },
  component: MediaManagementPage,
});

function getSetting<T>(
  settings: Record<string, unknown>,
  key: string,
  defaultValue: T,
): T {
  const v = settings[key];
  if (v === undefined || v === null) {
    return defaultValue;
  }
  return v as T;
}

// --- Content type definitions ---

type ContentType = "book" | "tv" | "movie" | "manga";

// Shared media management settings (same structure for all content types)
type MediaManagementSettings = {
  renameFiles: boolean;
  replaceIllegalCharacters: boolean;
  extraExtensions: string;
  createEmptyFolders: boolean;
  deleteEmptyFolders: boolean;
  useHardLinks: boolean;
  skipFreeSpaceCheck: boolean;
  minimumFreeSpace: number;
  importExtraFiles: boolean;
  propersAndRepacks: string;
  ignoreDeletedItems: boolean;
  changeFileDate: string;
  recyclingBin: string;
  recyclingBinCleanup: number;
  setPermissions: boolean;
  fileChmod: string;
  folderChmod: string;
  chownGroup: string;
};

// Book naming has ebook + audiobook sub-sections
type BookNamingSettings = {
  ebookBookFile: string;
  ebookAuthorFolder: string;
  ebookBookFolder: string;
  audiobookBookFile: string;
  audiobookAuthorFolder: string;
  audiobookBookFolder: string;
};

// TV naming
type TvNamingSettings = {
  standardEpisode: string;
  dailyEpisode: string;
  animeEpisode: string;
  seasonFolder: string;
  showFolder: string;
};

// Movie naming
type MovieNamingSettings = {
  movieFile: string;
  movieFolder: string;
};

// Manga naming
type MangaNamingSettings = {
  chapterFile: string;
  volumeFolder: string;
  mangaFolder: string;
};

type BookTabState = BookNamingSettings & MediaManagementSettings;
type TvTabState = TvNamingSettings & MediaManagementSettings;
type MovieTabState = MovieNamingSettings & MediaManagementSettings;
type MangaTabState = MangaNamingSettings & MediaManagementSettings;

type AllState = {
  book: BookTabState;
  tv: TvTabState;
  movie: MovieTabState;
  manga: MangaTabState;
};

// --- Token strings ---

const EBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}";
const AUDIOBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}, {PartNumber}, {PartNumber:00}, {PartCount}";
const TV_NAMING_TOKENS =
  "{Show Title}, {Season}, {Season:00}, {Episode}, {Episode:00}, {Episode Title}, {Absolute}, {Absolute:000}, {Air-Date}, {Year}, {Quality}, {Codec}, {Source}";
const MOVIE_NAMING_TOKENS =
  "{Movie Title}, {Year}, {Quality}, {Codec}, {Source}, {Edition}";
const MANGA_NAMING_TOKENS =
  "{Manga Title}, {Volume}, {Volume:00}, {Chapter}, {Chapter:000}, {Chapter Title}, {Scanlation Group}, {Year}";

// --- Build helpers ---

function buildMediaManagementSettings(
  settings: Record<string, unknown>,
  ct: ContentType,
): MediaManagementSettings {
  return {
    renameFiles: getSetting(
      settings,
      `mediaManagement.${ct}.renameBooks`,
      false,
    ),
    replaceIllegalCharacters: getSetting(
      settings,
      `mediaManagement.${ct}.replaceIllegalCharacters`,
      true,
    ),
    extraExtensions: getSetting(
      settings,
      `mediaManagement.${ct}.extraFileExtensions`,
      "",
    ),
    createEmptyFolders: getSetting(
      settings,
      `mediaManagement.${ct}.createEmptyAuthorFolders`,
      false,
    ),
    deleteEmptyFolders: getSetting(
      settings,
      `mediaManagement.${ct}.deleteEmptyAuthorFolders`,
      false,
    ),
    useHardLinks: getSetting(
      settings,
      `mediaManagement.${ct}.useHardLinks`,
      true,
    ),
    skipFreeSpaceCheck: getSetting(
      settings,
      `mediaManagement.${ct}.skipFreeSpaceCheck`,
      false,
    ),
    minimumFreeSpace: getSetting(
      settings,
      `mediaManagement.${ct}.minimumFreeSpace`,
      100,
    ),
    importExtraFiles: getSetting(
      settings,
      `mediaManagement.${ct}.importExtraFiles`,
      false,
    ),
    propersAndRepacks: getSetting(
      settings,
      `mediaManagement.${ct}.propersAndRepacks`,
      "preferAndUpgrade",
    ),
    ignoreDeletedItems: getSetting(
      settings,
      `mediaManagement.${ct}.ignoreDeletedBooks`,
      false,
    ),
    changeFileDate: getSetting(
      settings,
      `mediaManagement.${ct}.changeFileDate`,
      "none",
    ),
    recyclingBin: getSetting(
      settings,
      `mediaManagement.${ct}.recyclingBin`,
      "",
    ),
    recyclingBinCleanup: getSetting(
      settings,
      `mediaManagement.${ct}.recyclingBinCleanup`,
      7,
    ),
    setPermissions: getSetting(
      settings,
      `mediaManagement.${ct}.setPermissions`,
      false,
    ),
    fileChmod: getSetting(settings, `mediaManagement.${ct}.fileChmod`, "0644"),
    folderChmod: getSetting(
      settings,
      `mediaManagement.${ct}.folderChmod`,
      "0755",
    ),
    chownGroup: getSetting(settings, `mediaManagement.${ct}.chownGroup`, ""),
  };
}

function buildBookState(settings: Record<string, unknown>): BookTabState {
  return {
    ebookBookFile: getSetting(
      settings,
      "naming.book.ebook.bookFile",
      "{Author Name} - {Book Title}",
    ),
    ebookAuthorFolder: getSetting(
      settings,
      "naming.book.ebook.authorFolder",
      "{Author Name}",
    ),
    ebookBookFolder: getSetting(
      settings,
      "naming.book.ebook.bookFolder",
      "{Book Title} ({Release Year})",
    ),
    audiobookBookFile: getSetting(
      settings,
      "naming.book.audio.bookFile",
      "{Author Name} - {Book Title} - Part {PartNumber:00}",
    ),
    audiobookAuthorFolder: getSetting(
      settings,
      "naming.book.audio.authorFolder",
      "{Author Name}",
    ),
    audiobookBookFolder: getSetting(
      settings,
      "naming.book.audio.bookFolder",
      "{Book Title} ({Release Year})",
    ),
    ...buildMediaManagementSettings(settings, "book"),
  };
}

function buildTvState(settings: Record<string, unknown>): TvTabState {
  return {
    standardEpisode: getSetting(
      settings,
      "naming.tv.standardEpisode",
      "{Show Title} - S{Season:00}E{Episode:00} - {Episode Title}",
    ),
    dailyEpisode: getSetting(
      settings,
      "naming.tv.dailyEpisode",
      "{Show Title} - {Air-Date} - {Episode Title}",
    ),
    animeEpisode: getSetting(
      settings,
      "naming.tv.animeEpisode",
      "{Show Title} - S{Season:00}E{Episode:00} - {Absolute:000} - {Episode Title}",
    ),
    seasonFolder: getSetting(
      settings,
      "naming.tv.seasonFolder",
      "Season {Season:00}",
    ),
    showFolder: getSetting(
      settings,
      "naming.tv.showFolder",
      "{Show Title} ({Year})",
    ),
    ...buildMediaManagementSettings(settings, "tv"),
  };
}

function buildMovieState(settings: Record<string, unknown>): MovieTabState {
  return {
    movieFile: getSetting(
      settings,
      "naming.movie.movieFile",
      "{Movie Title} ({Year})",
    ),
    movieFolder: getSetting(
      settings,
      "naming.movie.movieFolder",
      "{Movie Title} ({Year})",
    ),
    ...buildMediaManagementSettings(settings, "movie"),
  };
}

function buildMangaState(settings: Record<string, unknown>): MangaTabState {
  return {
    chapterFile: getSetting(
      settings,
      "naming.manga.chapterFile",
      "{Manga Title} - Chapter {Chapter:000}",
    ),
    volumeFolder: getSetting(
      settings,
      "naming.manga.volumeFolder",
      "Volume {Volume:00}",
    ),
    mangaFolder: getSetting(
      settings,
      "naming.manga.mangaFolder",
      "{Manga Title} ({Year})",
    ),
    ...buildMediaManagementSettings(settings, "manga"),
  };
}

// --- Validation ---

function validateBookFile(
  variant: "ebook" | "audio",
  value: string,
): string | null {
  if (!value.includes("{Book Title}")) {
    return "Template must include {Book Title}";
  }
  if (
    variant === "audio" &&
    !value.includes("{PartNumber}") &&
    !value.includes("{PartNumber:00}") &&
    !value.includes("{PartCount}")
  ) {
    return "Template must include at least one of {PartNumber}, {PartNumber:00}, or {PartCount}";
  }
  return null;
}

// --- Content type label helpers ---

const CONTENT_TYPE_ITEM_LABELS: Record<ContentType, string> = {
  book: "books",
  tv: "episodes",
  movie: "movies",
  manga: "chapters",
};

const CONTENT_TYPE_DELETED_LABELS: Record<ContentType, string> = {
  book: "Books",
  tv: "Episodes",
  movie: "Movies",
  manga: "Chapters",
};

const CONTENT_TYPE_ROOT_FOLDER_LABELS: Record<ContentType, string> = {
  book: "book",
  tv: "TV show",
  movie: "movie",
  manga: "manga",
};

const CONTENT_TYPE_FOLDER_LABELS: Record<
  ContentType,
  { parent: string; child: string }
> = {
  book: { parent: "author", child: "book" },
  tv: { parent: "show", child: "season" },
  movie: { parent: "movie", child: "movie" },
  manga: { parent: "manga", child: "volume" },
};

// --- Shared media management UI component ---

function MediaManagementSection({
  contentType,
  settings,
  onUpdate,
}: {
  contentType: ContentType;
  settings: MediaManagementSettings;
  onUpdate: <K extends keyof MediaManagementSettings>(
    key: K,
    value: MediaManagementSettings[K],
  ) => void;
}) {
  const itemLabel = CONTENT_TYPE_ITEM_LABELS[contentType];
  const folderLabels = CONTENT_TYPE_FOLDER_LABELS[contentType];

  return (
    <>
      {/* Folders */}
      <Card>
        <CardHeader>
          <CardTitle>Folders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Create empty {folderLabels.parent} folders</Label>
              <p className="text-sm text-muted-foreground">
                Create folders for {folderLabels.parent}s even if they have no{" "}
                {itemLabel}.
              </p>
            </div>
            <Switch
              checked={settings.createEmptyFolders}
              onCheckedChange={(v) => onUpdate("createEmptyFolders", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Delete empty {folderLabels.parent} folders</Label>
              <p className="text-sm text-muted-foreground">
                Remove {folderLabels.parent} folders when they no longer contain
                any {itemLabel}.
              </p>
            </div>
            <Switch
              checked={settings.deleteEmptyFolders}
              onCheckedChange={(v) => onUpdate("deleteEmptyFolders", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Importing */}
      <Card>
        <CardHeader>
          <CardTitle>Importing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Copy using Hard Links</Label>
              <p className="text-sm text-muted-foreground">
                Use hard links instead of copying files when importing.
              </p>
            </div>
            <Switch
              checked={settings.useHardLinks}
              onCheckedChange={(v) => onUpdate("useHardLinks", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Skip Free Space Check</Label>
              <p className="text-sm text-muted-foreground">
                Skip checking available disk space before importing.
              </p>
            </div>
            <Switch
              checked={settings.skipFreeSpaceCheck}
              onCheckedChange={(v) => onUpdate("skipFreeSpaceCheck", v)}
            />
          </div>

          {!settings.skipFreeSpaceCheck && (
            <div className="space-y-2">
              <Label>Minimum Free Space (MB)</Label>
              <Input
                type="number"
                value={settings.minimumFreeSpace}
                onChange={(e) =>
                  onUpdate("minimumFreeSpace", Number(e.target.value))
                }
                min={0}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Import Extra Files</Label>
              <p className="text-sm text-muted-foreground">
                Import additional non-media files alongside the main file.
                Configure extensions in the Naming section above.
              </p>
            </div>
            <Switch
              checked={settings.importExtraFiles}
              onCheckedChange={(v) => onUpdate("importExtraFiles", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* File Management */}
      <Card>
        <CardHeader>
          <CardTitle>File Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Propers and Repacks</Label>
            <Select
              value={settings.propersAndRepacks}
              onValueChange={(v) => onUpdate("propersAndRepacks", v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preferAndUpgrade">
                  Prefer and Upgrade
                </SelectItem>
                <SelectItem value="doNotUpgrade">Do Not Upgrade</SelectItem>
                <SelectItem value="doNotPrefer">Do Not Prefer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>
                Ignore Deleted {CONTENT_TYPE_DELETED_LABELS[contentType]}
              </Label>
              <p className="text-sm text-muted-foreground">
                Do not unmonitor {itemLabel} when their files are deleted from
                disk.
              </p>
            </div>
            <Switch
              checked={settings.ignoreDeletedItems}
              onCheckedChange={(v) => onUpdate("ignoreDeletedItems", v)}
            />
          </div>

          <div className="space-y-2">
            <Label>Change File Date</Label>
            <Select
              value={settings.changeFileDate}
              onValueChange={(v) => onUpdate("changeFileDate", v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="releaseDate">Release Date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Recycling Bin</Label>
            <Input
              value={settings.recyclingBin}
              onChange={(e) => onUpdate("recyclingBin", e.target.value)}
              placeholder="Leave empty to disable"
            />
          </div>

          {settings.recyclingBin && (
            <div className="space-y-2">
              <Label>Recycling Bin Cleanup (days)</Label>
              <Input
                type="number"
                value={settings.recyclingBinCleanup}
                onChange={(e) =>
                  onUpdate("recyclingBinCleanup", Number(e.target.value))
                }
                min={0}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Set Permissions</Label>
              <p className="text-sm text-muted-foreground">
                Apply chmod and chown to imported files and folders.
              </p>
            </div>
            <Switch
              checked={settings.setPermissions}
              onCheckedChange={(v) => onUpdate("setPermissions", v)}
            />
          </div>

          {settings.setPermissions && (
            <>
              <div className="space-y-2">
                <Label>File chmod</Label>
                <Input
                  value={settings.fileChmod}
                  onChange={(e) => onUpdate("fileChmod", e.target.value)}
                  placeholder="0644"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Folder chmod</Label>
                <Input
                  value={settings.folderChmod}
                  onChange={(e) => onUpdate("folderChmod", e.target.value)}
                  placeholder="0755"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>chown Group</Label>
                <Input
                  value={settings.chownGroup}
                  onChange={(e) => onUpdate("chownGroup", e.target.value)}
                  placeholder="Leave empty to skip"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// --- Root Folders component ---

function RootFoldersSection({
  contentType,
  profiles,
}: {
  contentType: ContentType;
  profiles: Array<{
    contentType: string;
    rootFolderPath: string;
    name: string;
  }>;
}) {
  const rootFolderMap = new Map<string, string[]>();
  for (const profile of profiles) {
    if (
      profile.rootFolderPath &&
      (contentType === "book"
        ? profile.contentType === "ebook" || profile.contentType === "audiobook"
        : profile.contentType === contentType)
    ) {
      const existing = rootFolderMap.get(profile.rootFolderPath) ?? [];
      existing.push(profile.name);
      rootFolderMap.set(profile.rootFolderPath, existing);
    }
  }

  const label = CONTENT_TYPE_ROOT_FOLDER_LABELS[contentType];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Root Folders</CardTitle>
        <CardDescription>
          Root folders are configured per download profile.{" "}
          <Link
            to="/settings/profiles"
            className="text-primary hover:underline"
          >
            Manage Profiles
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rootFolderMap.size === 0 ? (
          <p className="text-sm text-muted-foreground">
            No {label} root folders configured. Add a root folder path in your{" "}
            {label} download profiles.
          </p>
        ) : (
          <div className="space-y-3">
            {[...rootFolderMap.entries()].map(([folderPath, profileNames]) => (
              <div
                key={folderPath}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <code className="text-sm">{folderPath}</code>
                <span className="text-sm text-muted-foreground">
                  {profileNames.join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Save helpers ---

function buildMediaManagementSaveEntries(
  ct: ContentType,
  mm: MediaManagementSettings,
): Array<{ key: string; value: string }> {
  return [
    { key: `mediaManagement.${ct}.renameBooks`, value: String(mm.renameFiles) },
    {
      key: `mediaManagement.${ct}.replaceIllegalCharacters`,
      value: String(mm.replaceIllegalCharacters),
    },
    {
      key: `mediaManagement.${ct}.extraFileExtensions`,
      value: mm.extraExtensions,
    },
    {
      key: `mediaManagement.${ct}.createEmptyAuthorFolders`,
      value: String(mm.createEmptyFolders),
    },
    {
      key: `mediaManagement.${ct}.deleteEmptyAuthorFolders`,
      value: String(mm.deleteEmptyFolders),
    },
    {
      key: `mediaManagement.${ct}.useHardLinks`,
      value: String(mm.useHardLinks),
    },
    {
      key: `mediaManagement.${ct}.skipFreeSpaceCheck`,
      value: String(mm.skipFreeSpaceCheck),
    },
    {
      key: `mediaManagement.${ct}.minimumFreeSpace`,
      value: String(mm.minimumFreeSpace),
    },
    {
      key: `mediaManagement.${ct}.importExtraFiles`,
      value: String(mm.importExtraFiles),
    },
    {
      key: `mediaManagement.${ct}.propersAndRepacks`,
      value: mm.propersAndRepacks,
    },
    {
      key: `mediaManagement.${ct}.ignoreDeletedBooks`,
      value: String(mm.ignoreDeletedItems),
    },
    { key: `mediaManagement.${ct}.changeFileDate`, value: mm.changeFileDate },
    { key: `mediaManagement.${ct}.recyclingBin`, value: mm.recyclingBin },
    {
      key: `mediaManagement.${ct}.recyclingBinCleanup`,
      value: String(mm.recyclingBinCleanup),
    },
    {
      key: `mediaManagement.${ct}.setPermissions`,
      value: String(mm.setPermissions),
    },
    { key: `mediaManagement.${ct}.fileChmod`, value: mm.fileChmod },
    { key: `mediaManagement.${ct}.folderChmod`, value: mm.folderChmod },
    { key: `mediaManagement.${ct}.chownGroup`, value: mm.chownGroup },
  ];
}

// --- Main page ---

function MediaManagementPage() {
  const { data: settings } = useSuspenseQuery(settingsMapQuery());
  const { data: profiles } = useSuspenseQuery(downloadProfilesListQuery());
  const updateSettings = useUpdateSettings();

  const [activeTab, setActiveTab] = useState<ContentType>("book");
  const [state, setState] = useState<AllState>({
    book: buildBookState(settings),
    tv: buildTvState(settings),
    movie: buildMovieState(settings),
    manga: buildMangaState(settings),
  });

  // Generic field updater for any tab
  function updateBookField<K extends keyof BookTabState>(
    key: K,
    value: BookTabState[K],
  ) {
    setState((prev) => ({
      ...prev,
      book: { ...prev.book, [key]: value },
    }));
  }

  function updateTvField<K extends keyof TvTabState>(
    key: K,
    value: TvTabState[K],
  ) {
    setState((prev) => ({
      ...prev,
      tv: { ...prev.tv, [key]: value },
    }));
  }

  function updateMovieField<K extends keyof MovieTabState>(
    key: K,
    value: MovieTabState[K],
  ) {
    setState((prev) => ({
      ...prev,
      movie: { ...prev.movie, [key]: value },
    }));
  }

  function updateMangaField<K extends keyof MangaTabState>(
    key: K,
    value: MangaTabState[K],
  ) {
    setState((prev) => ({
      ...prev,
      manga: { ...prev.manga, [key]: value },
    }));
  }

  // --- Save handlers ---

  const handleSaveBook = () => {
    const s = state.book;
    const entries = [
      // Ebook naming
      { key: "naming.book.ebook.bookFile", value: s.ebookBookFile },
      { key: "naming.book.ebook.authorFolder", value: s.ebookAuthorFolder },
      { key: "naming.book.ebook.bookFolder", value: s.ebookBookFolder },
      // Audiobook naming
      { key: "naming.book.audio.bookFile", value: s.audiobookBookFile },
      { key: "naming.book.audio.authorFolder", value: s.audiobookAuthorFolder },
      { key: "naming.book.audio.bookFolder", value: s.audiobookBookFolder },
      // Shared media management
      ...buildMediaManagementSaveEntries("book", s),
    ];
    updateSettings.mutate(entries);
  };

  const handleSaveTv = () => {
    const s = state.tv;
    const entries = [
      { key: "naming.tv.standardEpisode", value: s.standardEpisode },
      { key: "naming.tv.dailyEpisode", value: s.dailyEpisode },
      { key: "naming.tv.animeEpisode", value: s.animeEpisode },
      { key: "naming.tv.seasonFolder", value: s.seasonFolder },
      { key: "naming.tv.showFolder", value: s.showFolder },
      ...buildMediaManagementSaveEntries("tv", s),
    ];
    updateSettings.mutate(entries);
  };

  const handleSaveMovie = () => {
    const s = state.movie;
    const entries = [
      { key: "naming.movie.movieFile", value: s.movieFile },
      { key: "naming.movie.movieFolder", value: s.movieFolder },
      ...buildMediaManagementSaveEntries("movie", s),
    ];
    updateSettings.mutate(entries);
  };

  const handleSaveManga = () => {
    const s = state.manga;
    const entries = [
      { key: "naming.manga.chapterFile", value: s.chapterFile },
      { key: "naming.manga.volumeFolder", value: s.volumeFolder },
      { key: "naming.manga.mangaFolder", value: s.mangaFolder },
      ...buildMediaManagementSaveEntries("manga", s),
    ];
    updateSettings.mutate(entries);
  };

  const handleSave = () => {
    if (activeTab === "book") {
      handleSaveBook();
    } else if (activeTab === "tv") {
      handleSaveTv();
    } else if (activeTab === "movie") {
      handleSaveMovie();
    } else {
      handleSaveManga();
    }
  };

  // --- Validation ---

  const ebookFileError = validateBookFile("ebook", state.book.ebookBookFile);
  const audiobookFileError = validateBookFile(
    "audio",
    state.book.audiobookBookFile,
  );
  const hasBookErrors = Boolean(ebookFileError) || Boolean(audiobookFileError);

  return (
    <div>
      <PageHeader title="Media Management" />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ContentType)}
      >
        <TabsList>
          <TabsTrigger value="book">Books</TabsTrigger>
          <TabsTrigger value="tv">TV Shows</TabsTrigger>
          <TabsTrigger value="movie">Movies</TabsTrigger>
          <TabsTrigger value="manga">Manga</TabsTrigger>
        </TabsList>

        {/* ===== BOOKS TAB ===== */}
        <TabsContent value="book">
          <div className="space-y-6 max-w-2xl">
            {/* Ebook Naming */}
            <Card>
              <CardHeader>
                <CardTitle>Ebook Naming</CardTitle>
                <CardDescription>
                  Configure how ebook files and folders are named.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Rename Books</Label>
                    <p className="text-sm text-muted-foreground">
                      Rename imported book files using the configured format.
                    </p>
                  </div>
                  <Switch
                    checked={state.book.renameFiles}
                    onCheckedChange={(v) => updateBookField("renameFiles", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Replace Illegal Characters</Label>
                    <p className="text-sm text-muted-foreground">
                      Replace characters that are not allowed in file paths.
                    </p>
                  </div>
                  <Switch
                    checked={state.book.replaceIllegalCharacters}
                    onCheckedChange={(v) =>
                      updateBookField("replaceIllegalCharacters", v)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Standard Book Format</Label>
                  <Input
                    value={state.book.ebookBookFile}
                    onChange={(e) =>
                      updateBookField("ebookBookFile", e.target.value)
                    }
                    disabled={!state.book.renameFiles}
                  />
                  {ebookFileError && (
                    <p className="text-xs text-destructive">{ebookFileError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {EBOOK_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Author Folder Format</Label>
                  <Input
                    value={state.book.ebookAuthorFolder}
                    onChange={(e) =>
                      updateBookField("ebookAuthorFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {EBOOK_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Book Folder Format</Label>
                  <Input
                    value={state.book.ebookBookFolder}
                    onChange={(e) =>
                      updateBookField("ebookBookFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {EBOOK_NAMING_TOKENS}
                  </p>
                </div>

                {state.book.importExtraFiles && (
                  <div className="space-y-2">
                    <Label>Extra File Extensions</Label>
                    <Input
                      value={state.book.extraExtensions}
                      onChange={(e) =>
                        updateBookField("extraExtensions", e.target.value)
                      }
                      placeholder=".jpg,.opf"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audiobook Naming */}
            <Card>
              <CardHeader>
                <CardTitle>Audiobook Naming</CardTitle>
                <CardDescription>
                  Configure how audiobook files and folders are named.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Standard Book Format</Label>
                  <Input
                    value={state.book.audiobookBookFile}
                    onChange={(e) =>
                      updateBookField("audiobookBookFile", e.target.value)
                    }
                    disabled={!state.book.renameFiles}
                  />
                  {audiobookFileError && (
                    <p className="text-xs text-destructive">
                      {audiobookFileError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {AUDIOBOOK_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Author Folder Format</Label>
                  <Input
                    value={state.book.audiobookAuthorFolder}
                    onChange={(e) =>
                      updateBookField("audiobookAuthorFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {AUDIOBOOK_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Book Folder Format</Label>
                  <Input
                    value={state.book.audiobookBookFolder}
                    onChange={(e) =>
                      updateBookField("audiobookBookFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {AUDIOBOOK_NAMING_TOKENS}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Shared media management for books */}
            <MediaManagementSection
              contentType="book"
              settings={state.book}
              onUpdate={(key, value) =>
                updateBookField(key as keyof BookTabState, value as never)
              }
            />

            <RootFoldersSection contentType="book" profiles={profiles} />

            <Button
              onClick={handleSave}
              disabled={updateSettings.isPending || hasBookErrors}
            >
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </TabsContent>

        {/* ===== TV SHOWS TAB ===== */}
        <TabsContent value="tv">
          <div className="space-y-6 max-w-2xl">
            {/* TV Naming */}
            <Card>
              <CardHeader>
                <CardTitle>Episode Naming</CardTitle>
                <CardDescription>
                  Configure how TV episode files and folders are named.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Rename Episodes</Label>
                    <p className="text-sm text-muted-foreground">
                      Rename imported episode files using the configured format.
                    </p>
                  </div>
                  <Switch
                    checked={state.tv.renameFiles}
                    onCheckedChange={(v) => updateTvField("renameFiles", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Replace Illegal Characters</Label>
                    <p className="text-sm text-muted-foreground">
                      Replace characters that are not allowed in file paths.
                    </p>
                  </div>
                  <Switch
                    checked={state.tv.replaceIllegalCharacters}
                    onCheckedChange={(v) =>
                      updateTvField("replaceIllegalCharacters", v)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Standard Episode Format</Label>
                  <Input
                    value={state.tv.standardEpisode}
                    onChange={(e) =>
                      updateTvField("standardEpisode", e.target.value)
                    }
                    disabled={!state.tv.renameFiles}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {TV_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Daily Episode Format</Label>
                  <Input
                    value={state.tv.dailyEpisode}
                    onChange={(e) =>
                      updateTvField("dailyEpisode", e.target.value)
                    }
                    disabled={!state.tv.renameFiles}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {TV_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Anime Episode Format</Label>
                  <Input
                    value={state.tv.animeEpisode}
                    onChange={(e) =>
                      updateTvField("animeEpisode", e.target.value)
                    }
                    disabled={!state.tv.renameFiles}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {TV_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Season Folder Format</Label>
                  <Input
                    value={state.tv.seasonFolder}
                    onChange={(e) =>
                      updateTvField("seasonFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {TV_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Show Folder Format</Label>
                  <Input
                    value={state.tv.showFolder}
                    onChange={(e) =>
                      updateTvField("showFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {TV_NAMING_TOKENS}
                  </p>
                </div>

                {state.tv.importExtraFiles && (
                  <div className="space-y-2">
                    <Label>Extra File Extensions</Label>
                    <Input
                      value={state.tv.extraExtensions}
                      onChange={(e) =>
                        updateTvField("extraExtensions", e.target.value)
                      }
                      placeholder=".srt,.sub,.nfo"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* TV media management */}
            <MediaManagementSection
              contentType="tv"
              settings={state.tv}
              onUpdate={(key, value) =>
                updateTvField(key as keyof TvTabState, value as never)
              }
            />

            <RootFoldersSection contentType="tv" profiles={profiles} />

            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </TabsContent>

        {/* ===== MOVIES TAB ===== */}
        <TabsContent value="movie">
          <div className="space-y-6 max-w-2xl">
            {/* Movie Naming */}
            <Card>
              <CardHeader>
                <CardTitle>Movie Naming</CardTitle>
                <CardDescription>
                  Configure how movie files and folders are named.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Rename Movies</Label>
                    <p className="text-sm text-muted-foreground">
                      Rename imported movie files using the configured format.
                    </p>
                  </div>
                  <Switch
                    checked={state.movie.renameFiles}
                    onCheckedChange={(v) => updateMovieField("renameFiles", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Replace Illegal Characters</Label>
                    <p className="text-sm text-muted-foreground">
                      Replace characters that are not allowed in file paths.
                    </p>
                  </div>
                  <Switch
                    checked={state.movie.replaceIllegalCharacters}
                    onCheckedChange={(v) =>
                      updateMovieField("replaceIllegalCharacters", v)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Movie File Format</Label>
                  <Input
                    value={state.movie.movieFile}
                    onChange={(e) =>
                      updateMovieField("movieFile", e.target.value)
                    }
                    disabled={!state.movie.renameFiles}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {MOVIE_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Movie Folder Format</Label>
                  <Input
                    value={state.movie.movieFolder}
                    onChange={(e) =>
                      updateMovieField("movieFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {MOVIE_NAMING_TOKENS}
                  </p>
                </div>

                {state.movie.importExtraFiles && (
                  <div className="space-y-2">
                    <Label>Extra File Extensions</Label>
                    <Input
                      value={state.movie.extraExtensions}
                      onChange={(e) =>
                        updateMovieField("extraExtensions", e.target.value)
                      }
                      placeholder=".srt,.sub,.nfo"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Movie media management */}
            <MediaManagementSection
              contentType="movie"
              settings={state.movie}
              onUpdate={(key, value) =>
                updateMovieField(key as keyof MovieTabState, value as never)
              }
            />

            <RootFoldersSection contentType="movie" profiles={profiles} />

            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </TabsContent>

        {/* ===== MANGA TAB ===== */}
        <TabsContent value="manga">
          <div className="space-y-6 max-w-2xl">
            {/* Manga Naming */}
            <Card>
              <CardHeader>
                <CardTitle>Manga Naming</CardTitle>
                <CardDescription>
                  Configure how manga chapter files and folders are named.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Rename Chapters</Label>
                    <p className="text-sm text-muted-foreground">
                      Rename imported chapter files using the configured format.
                    </p>
                  </div>
                  <Switch
                    checked={state.manga.renameFiles}
                    onCheckedChange={(v) => updateMangaField("renameFiles", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Replace Illegal Characters</Label>
                    <p className="text-sm text-muted-foreground">
                      Replace characters that are not allowed in file paths.
                    </p>
                  </div>
                  <Switch
                    checked={state.manga.replaceIllegalCharacters}
                    onCheckedChange={(v) =>
                      updateMangaField("replaceIllegalCharacters", v)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Chapter File Format</Label>
                  <Input
                    value={state.manga.chapterFile}
                    onChange={(e) =>
                      updateMangaField("chapterFile", e.target.value)
                    }
                    disabled={!state.manga.renameFiles}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {MANGA_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Volume Folder Format</Label>
                  <Input
                    value={state.manga.volumeFolder}
                    onChange={(e) =>
                      updateMangaField("volumeFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {MANGA_NAMING_TOKENS}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Manga Folder Format</Label>
                  <Input
                    value={state.manga.mangaFolder}
                    onChange={(e) =>
                      updateMangaField("mangaFolder", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {MANGA_NAMING_TOKENS}
                  </p>
                </div>

                {state.manga.importExtraFiles && (
                  <div className="space-y-2">
                    <Label>Extra File Extensions</Label>
                    <Input
                      value={state.manga.extraExtensions}
                      onChange={(e) =>
                        updateMangaField("extraExtensions", e.target.value)
                      }
                      placeholder=".jpg,.png,.nfo"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manga media management */}
            <MediaManagementSection
              contentType="manga"
              settings={state.manga}
              onUpdate={(key, value) =>
                updateMangaField(key as keyof MangaTabState, value as never)
              }
            />

            <RootFoldersSection contentType="manga" profiles={profiles} />

            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
