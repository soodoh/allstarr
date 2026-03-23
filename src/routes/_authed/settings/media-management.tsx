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

type MediaType = "ebook" | "audiobook";

type TypeSettings = {
  renameBooks: boolean;
  replaceIllegalCharacters: boolean;
  bookFile: string;
  authorFolder: string;
  bookFolder: string;
  extraExtensions: string;
  createEmptyAuthorFolders: boolean;
  deleteEmptyAuthorFolders: boolean;
  useHardLinks: boolean;
  skipFreeSpaceCheck: boolean;
  minimumFreeSpace: number;
  importExtraFiles: boolean;
  propersAndRepacks: string;
  ignoreDeletedBooks: boolean;
  changeFileDate: string;
  recyclingBin: string;
  recyclingBinCleanup: number;
  setPermissions: boolean;
  fileChmod: string;
  folderChmod: string;
  chownGroup: string;
};

const EBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}";
const AUDIOBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}, {PartNumber}, {PartNumber:00}, {PartCount}";

function buildTypeSettings(
  settings: Record<string, unknown>,
  type: MediaType,
): TypeSettings {
  const t = type;
  return {
    renameBooks: getSetting(
      settings,
      `mediaManagement.${t}.renameBooks`,
      false,
    ),
    replaceIllegalCharacters: getSetting(
      settings,
      `mediaManagement.${t}.replaceIllegalCharacters`,
      true,
    ),
    bookFile: getSetting(
      settings,
      `naming.${t}.bookFile`,
      t === "audiobook"
        ? "{Author Name} - {Book Title} - Part {PartNumber:00}"
        : "{Author Name} - {Book Title}",
    ),
    authorFolder: getSetting(
      settings,
      `naming.${t}.authorFolder`,
      "{Author Name}",
    ),
    bookFolder: getSetting(
      settings,
      `naming.${t}.bookFolder`,
      "{Book Title} ({Release Year})",
    ),
    extraExtensions: getSetting(
      settings,
      `mediaManagement.${t}.extraFileExtensions`,
      t === "audiobook" ? ".cue,.nfo" : "",
    ),
    createEmptyAuthorFolders: getSetting(
      settings,
      `mediaManagement.${t}.createEmptyAuthorFolders`,
      false,
    ),
    deleteEmptyAuthorFolders: getSetting(
      settings,
      `mediaManagement.${t}.deleteEmptyAuthorFolders`,
      false,
    ),
    useHardLinks: getSetting(
      settings,
      `mediaManagement.${t}.useHardLinks`,
      true,
    ),
    skipFreeSpaceCheck: getSetting(
      settings,
      `mediaManagement.${t}.skipFreeSpaceCheck`,
      false,
    ),
    minimumFreeSpace: getSetting(
      settings,
      `mediaManagement.${t}.minimumFreeSpace`,
      100,
    ),
    importExtraFiles: getSetting(
      settings,
      `mediaManagement.${t}.importExtraFiles`,
      false,
    ),
    propersAndRepacks: getSetting(
      settings,
      `mediaManagement.${t}.propersAndRepacks`,
      "preferAndUpgrade",
    ),
    ignoreDeletedBooks: getSetting(
      settings,
      `mediaManagement.${t}.ignoreDeletedBooks`,
      false,
    ),
    changeFileDate: getSetting(
      settings,
      `mediaManagement.${t}.changeFileDate`,
      "none",
    ),
    recyclingBin: getSetting(settings, `mediaManagement.${t}.recyclingBin`, ""),
    recyclingBinCleanup: getSetting(
      settings,
      `mediaManagement.${t}.recyclingBinCleanup`,
      7,
    ),
    setPermissions: getSetting(
      settings,
      `mediaManagement.${t}.setPermissions`,
      false,
    ),
    fileChmod: getSetting(settings, `mediaManagement.${t}.fileChmod`, "0644"),
    folderChmod: getSetting(
      settings,
      `mediaManagement.${t}.folderChmod`,
      "0755",
    ),
    chownGroup: getSetting(settings, `mediaManagement.${t}.chownGroup`, ""),
  };
}

function validateBookFile(type: MediaType, value: string): string | null {
  if (!value.includes("{Book Title}")) {
    return "Template must include {Book Title}";
  }
  if (
    type === "audiobook" &&
    !value.includes("{PartNumber}") &&
    !value.includes("{PartNumber:00}") &&
    !value.includes("{PartCount}")
  ) {
    return "Template must include {Book Title} and at least one of {PartNumber}, {PartNumber:00}, or {PartCount}";
  }
  return null;
}

function MediaManagementPage() {
  const { data: settings } = useSuspenseQuery(settingsMapQuery());
  const { data: profiles } = useSuspenseQuery(downloadProfilesListQuery());
  const updateSettings = useUpdateSettings();

  const [activeTab, setActiveTab] = useState<MediaType>("ebook");
  const [state, setState] = useState<Record<MediaType, TypeSettings>>({
    ebook: buildTypeSettings(settings, "ebook"),
    audiobook: buildTypeSettings(settings, "audiobook"),
  });

  function updateField<K extends keyof TypeSettings>(
    type: MediaType,
    key: K,
    value: TypeSettings[K],
  ) {
    setState((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: value },
    }));
  }

  function getRootFolderMap(type: MediaType) {
    const map = new Map<string, string[]>();
    for (const profile of profiles) {
      if (profile.rootFolderPath && profile.type === type) {
        const existing = map.get(profile.rootFolderPath) ?? [];
        existing.push(profile.name);
        map.set(profile.rootFolderPath, existing);
      }
    }
    return map;
  }

  const handleSave = () => {
    const t = activeTab;
    const s = state[t];
    updateSettings.mutate([
      { key: `mediaManagement.${t}.renameBooks`, value: String(s.renameBooks) },
      {
        key: `mediaManagement.${t}.replaceIllegalCharacters`,
        value: String(s.replaceIllegalCharacters),
      },
      { key: `naming.${t}.bookFile`, value: s.bookFile },
      { key: `naming.${t}.authorFolder`, value: s.authorFolder },
      { key: `naming.${t}.bookFolder`, value: s.bookFolder },
      {
        key: `mediaManagement.${t}.extraFileExtensions`,
        value: s.extraExtensions,
      },
      {
        key: `mediaManagement.${t}.createEmptyAuthorFolders`,
        value: String(s.createEmptyAuthorFolders),
      },
      {
        key: `mediaManagement.${t}.deleteEmptyAuthorFolders`,
        value: String(s.deleteEmptyAuthorFolders),
      },
      {
        key: `mediaManagement.${t}.useHardLinks`,
        value: String(s.useHardLinks),
      },
      {
        key: `mediaManagement.${t}.skipFreeSpaceCheck`,
        value: String(s.skipFreeSpaceCheck),
      },
      {
        key: `mediaManagement.${t}.minimumFreeSpace`,
        value: String(s.minimumFreeSpace),
      },
      {
        key: `mediaManagement.${t}.importExtraFiles`,
        value: String(s.importExtraFiles),
      },
      {
        key: `mediaManagement.${t}.propersAndRepacks`,
        value: s.propersAndRepacks,
      },
      {
        key: `mediaManagement.${t}.ignoreDeletedBooks`,
        value: String(s.ignoreDeletedBooks),
      },
      { key: `mediaManagement.${t}.changeFileDate`, value: s.changeFileDate },
      { key: `mediaManagement.${t}.recyclingBin`, value: s.recyclingBin },
      {
        key: `mediaManagement.${t}.recyclingBinCleanup`,
        value: String(s.recyclingBinCleanup),
      },
      {
        key: `mediaManagement.${t}.setPermissions`,
        value: String(s.setPermissions),
      },
      { key: `mediaManagement.${t}.fileChmod`, value: s.fileChmod },
      { key: `mediaManagement.${t}.folderChmod`, value: s.folderChmod },
      { key: `mediaManagement.${t}.chownGroup`, value: s.chownGroup },
    ]);
  };

  return (
    <div>
      <PageHeader title="Media Management" />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as MediaType)}
      >
        <TabsList>
          <TabsTrigger value="ebook">Ebook</TabsTrigger>
          <TabsTrigger value="audiobook">Audiobook</TabsTrigger>
        </TabsList>

        {(["ebook", "audiobook"] as const).map((type) => {
          const current = state[type];
          const namingTokens =
            type === "audiobook"
              ? AUDIOBOOK_NAMING_TOKENS
              : EBOOK_NAMING_TOKENS;
          const bookFileError = validateBookFile(type, current.bookFile);
          const rootFolderMap = getRootFolderMap(type);

          return (
            <TabsContent key={type} value={type}>
              <div className="space-y-6 max-w-2xl">
                {/* Book Naming */}
                <Card>
                  <CardHeader>
                    <CardTitle>Book Naming</CardTitle>
                    <CardDescription>
                      Configure how {type} files and folders are named.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Rename Books</Label>
                        <p className="text-sm text-muted-foreground">
                          Rename imported book files using the configured
                          format.
                        </p>
                      </div>
                      <Switch
                        checked={current.renameBooks}
                        onCheckedChange={(v) =>
                          updateField(type, "renameBooks", v)
                        }
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
                        checked={current.replaceIllegalCharacters}
                        onCheckedChange={(v) =>
                          updateField(type, "replaceIllegalCharacters", v)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Standard Book Format</Label>
                      <Input
                        value={current.bookFile}
                        onChange={(e) =>
                          updateField(type, "bookFile", e.target.value)
                        }
                        disabled={!current.renameBooks}
                      />
                      {bookFileError && (
                        <p className="text-xs text-destructive">
                          {bookFileError}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Available tokens: {namingTokens}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Author Folder Format</Label>
                      <Input
                        value={current.authorFolder}
                        onChange={(e) =>
                          updateField(type, "authorFolder", e.target.value)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Available tokens: {namingTokens}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Book Folder Format</Label>
                      <Input
                        value={current.bookFolder}
                        onChange={(e) =>
                          updateField(type, "bookFolder", e.target.value)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Available tokens: {namingTokens}
                      </p>
                    </div>

                    {current.importExtraFiles && (
                      <div className="space-y-2">
                        <Label>Extra File Extensions</Label>
                        <Input
                          value={current.extraExtensions}
                          onChange={(e) =>
                            updateField(type, "extraExtensions", e.target.value)
                          }
                          placeholder={
                            type === "audiobook" ? ".cue,.nfo" : ".jpg,.opf"
                          }
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Folders */}
                <Card>
                  <CardHeader>
                    <CardTitle>Folders</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Create empty author folders</Label>
                        <p className="text-sm text-muted-foreground">
                          Create folders for authors even if they have no books.
                        </p>
                      </div>
                      <Switch
                        checked={current.createEmptyAuthorFolders}
                        onCheckedChange={(v) =>
                          updateField(type, "createEmptyAuthorFolders", v)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Delete empty author folders</Label>
                        <p className="text-sm text-muted-foreground">
                          Remove author folders when they no longer contain any
                          books.
                        </p>
                      </div>
                      <Switch
                        checked={current.deleteEmptyAuthorFolders}
                        onCheckedChange={(v) =>
                          updateField(type, "deleteEmptyAuthorFolders", v)
                        }
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
                          Use hard links instead of copying files when
                          importing.
                        </p>
                      </div>
                      <Switch
                        checked={current.useHardLinks}
                        onCheckedChange={(v) =>
                          updateField(type, "useHardLinks", v)
                        }
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
                        checked={current.skipFreeSpaceCheck}
                        onCheckedChange={(v) =>
                          updateField(type, "skipFreeSpaceCheck", v)
                        }
                      />
                    </div>

                    {!current.skipFreeSpaceCheck && (
                      <div className="space-y-2">
                        <Label>Minimum Free Space (MB)</Label>
                        <Input
                          type="number"
                          value={current.minimumFreeSpace}
                          onChange={(e) =>
                            updateField(
                              type,
                              "minimumFreeSpace",
                              Number(e.target.value),
                            )
                          }
                          min={0}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Import Extra Files</Label>
                        <p className="text-sm text-muted-foreground">
                          Import additional non-book files alongside the book.
                          Configure extensions in the Book Naming section above.
                        </p>
                      </div>
                      <Switch
                        checked={current.importExtraFiles}
                        onCheckedChange={(v) =>
                          updateField(type, "importExtraFiles", v)
                        }
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
                        value={current.propersAndRepacks}
                        onValueChange={(v) =>
                          updateField(type, "propersAndRepacks", v)
                        }
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preferAndUpgrade">
                            Prefer and Upgrade
                          </SelectItem>
                          <SelectItem value="doNotUpgrade">
                            Do Not Upgrade
                          </SelectItem>
                          <SelectItem value="doNotPrefer">
                            Do Not Prefer
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Ignore Deleted Books</Label>
                        <p className="text-sm text-muted-foreground">
                          Do not unmonitor books when their files are deleted
                          from disk.
                        </p>
                      </div>
                      <Switch
                        checked={current.ignoreDeletedBooks}
                        onCheckedChange={(v) =>
                          updateField(type, "ignoreDeletedBooks", v)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Change File Date</Label>
                      <Select
                        value={current.changeFileDate}
                        onValueChange={(v) =>
                          updateField(type, "changeFileDate", v)
                        }
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="releaseDate">
                            Release Date
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Recycling Bin</Label>
                      <Input
                        value={current.recyclingBin}
                        onChange={(e) =>
                          updateField(type, "recyclingBin", e.target.value)
                        }
                        placeholder="Leave empty to disable"
                      />
                    </div>

                    {current.recyclingBin && (
                      <div className="space-y-2">
                        <Label>Recycling Bin Cleanup (days)</Label>
                        <Input
                          type="number"
                          value={current.recyclingBinCleanup}
                          onChange={(e) =>
                            updateField(
                              type,
                              "recyclingBinCleanup",
                              Number(e.target.value),
                            )
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
                        checked={current.setPermissions}
                        onCheckedChange={(v) =>
                          updateField(type, "setPermissions", v)
                        }
                      />
                    </div>

                    {current.setPermissions && (
                      <>
                        <div className="space-y-2">
                          <Label>File chmod</Label>
                          <Input
                            value={current.fileChmod}
                            onChange={(e) =>
                              updateField(type, "fileChmod", e.target.value)
                            }
                            placeholder="0644"
                            className="font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Folder chmod</Label>
                          <Input
                            value={current.folderChmod}
                            onChange={(e) =>
                              updateField(type, "folderChmod", e.target.value)
                            }
                            placeholder="0755"
                            className="font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>chown Group</Label>
                          <Input
                            value={current.chownGroup}
                            onChange={(e) =>
                              updateField(type, "chownGroup", e.target.value)
                            }
                            placeholder="Leave empty to skip"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Root Folders */}
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
                        No {type} root folders configured. Add a root folder
                        path in your {type} download profiles.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {[...rootFolderMap.entries()].map(
                          ([folderPath, profileNames]) => (
                            <div
                              key={folderPath}
                              className="flex items-center justify-between rounded-md border px-4 py-3"
                            >
                              <code className="text-sm">{folderPath}</code>
                              <span className="text-sm text-muted-foreground">
                                {profileNames.join(", ")}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Button
                  onClick={handleSave}
                  disabled={updateSettings.isPending || Boolean(bookFileError)}
                >
                  {updateSettings.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
