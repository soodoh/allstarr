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

const NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}, {PartNumber}";

function MediaManagementPage() {
  const { data: settings } = useSuspenseQuery(settingsMapQuery());
  const { data: profiles } = useSuspenseQuery(downloadProfilesListQuery());
  const updateSettings = useUpdateSettings();

  // Book Naming
  const [renameBooks, setRenameBooks] = useState(
    getSetting(settings, "mediaManagement.renameBooks", false),
  );
  const [replaceIllegalCharacters, setReplaceIllegalCharacters] = useState(
    getSetting(settings, "mediaManagement.replaceIllegalCharacters", true),
  );
  const [bookFile, setBookFile] = useState(
    getSetting(settings, "naming.bookFile", "{Author Name} - {Book Title}"),
  );
  const [authorFolder, setAuthorFolder] = useState(
    getSetting(settings, "naming.authorFolder", "{Author Name}"),
  );
  const [bookFolder, setBookFolder] = useState(
    getSetting(settings, "naming.bookFolder", "{Book Title} ({Release Year})"),
  );

  // Folders
  const [createEmptyAuthorFolders, setCreateEmptyAuthorFolders] = useState(
    getSetting(settings, "mediaManagement.createEmptyAuthorFolders", false),
  );
  const [deleteEmptyAuthorFolders, setDeleteEmptyAuthorFolders] = useState(
    getSetting(settings, "mediaManagement.deleteEmptyAuthorFolders", false),
  );

  // Importing
  const [useHardLinks, setUseHardLinks] = useState(
    getSetting(settings, "mediaManagement.useHardLinks", true),
  );
  const [skipFreeSpaceCheck, setSkipFreeSpaceCheck] = useState(
    getSetting(settings, "mediaManagement.skipFreeSpaceCheck", false),
  );
  const [minimumFreeSpace, setMinimumFreeSpace] = useState(
    getSetting(settings, "mediaManagement.minimumFreeSpace", 100),
  );
  const [importExtraFiles, setImportExtraFiles] = useState(
    getSetting(settings, "mediaManagement.importExtraFiles", false),
  );
  const [extraFileExtensions, setExtraFileExtensions] = useState(
    getSetting(settings, "mediaManagement.extraFileExtensions", ""),
  );

  // File Management
  const [propersAndRepacks, setPropersAndRepacks] = useState(
    getSetting(
      settings,
      "mediaManagement.propersAndRepacks",
      "preferAndUpgrade",
    ),
  );
  const [ignoreDeletedBooks, setIgnoreDeletedBooks] = useState(
    getSetting(settings, "mediaManagement.ignoreDeletedBooks", false),
  );
  const [changeFileDate, setChangeFileDate] = useState(
    getSetting(settings, "mediaManagement.changeFileDate", "none"),
  );
  const [recyclingBin, setRecyclingBin] = useState(
    getSetting(settings, "mediaManagement.recyclingBin", ""),
  );
  const [recyclingBinCleanup, setRecyclingBinCleanup] = useState(
    getSetting(settings, "mediaManagement.recyclingBinCleanup", 7),
  );

  // Permissions
  const [setPermissions, setSetPermissions] = useState(
    getSetting(settings, "mediaManagement.setPermissions", false),
  );
  const [fileChmod, setFileChmod] = useState(
    getSetting(settings, "mediaManagement.fileChmod", "0644"),
  );
  const [folderChmod, setFolderChmod] = useState(
    getSetting(settings, "mediaManagement.folderChmod", "0755"),
  );
  const [chownGroup, setChownGroup] = useState(
    getSetting(settings, "mediaManagement.chownGroup", ""),
  );

  // Root folders from profiles
  const rootFolderMap = new Map<string, string[]>();
  for (const profile of profiles) {
    if (profile.rootFolderPath) {
      const existing = rootFolderMap.get(profile.rootFolderPath) ?? [];
      existing.push(profile.name);
      rootFolderMap.set(profile.rootFolderPath, existing);
    }
  }

  const handleSave = () => {
    updateSettings.mutate([
      { key: "mediaManagement.renameBooks", value: String(renameBooks) },
      {
        key: "mediaManagement.replaceIllegalCharacters",
        value: String(replaceIllegalCharacters),
      },
      { key: "naming.bookFile", value: bookFile },
      { key: "naming.authorFolder", value: authorFolder },
      { key: "naming.bookFolder", value: bookFolder },
      {
        key: "mediaManagement.createEmptyAuthorFolders",
        value: String(createEmptyAuthorFolders),
      },
      {
        key: "mediaManagement.deleteEmptyAuthorFolders",
        value: String(deleteEmptyAuthorFolders),
      },
      { key: "mediaManagement.useHardLinks", value: String(useHardLinks) },
      {
        key: "mediaManagement.skipFreeSpaceCheck",
        value: String(skipFreeSpaceCheck),
      },
      {
        key: "mediaManagement.minimumFreeSpace",
        value: String(minimumFreeSpace),
      },
      {
        key: "mediaManagement.importExtraFiles",
        value: String(importExtraFiles),
      },
      {
        key: "mediaManagement.extraFileExtensions",
        value: extraFileExtensions,
      },
      {
        key: "mediaManagement.propersAndRepacks",
        value: propersAndRepacks,
      },
      {
        key: "mediaManagement.ignoreDeletedBooks",
        value: String(ignoreDeletedBooks),
      },
      { key: "mediaManagement.changeFileDate", value: changeFileDate },
      { key: "mediaManagement.recyclingBin", value: recyclingBin },
      {
        key: "mediaManagement.recyclingBinCleanup",
        value: String(recyclingBinCleanup),
      },
      { key: "mediaManagement.setPermissions", value: String(setPermissions) },
      { key: "mediaManagement.fileChmod", value: fileChmod },
      { key: "mediaManagement.folderChmod", value: folderChmod },
      { key: "mediaManagement.chownGroup", value: chownGroup },
    ]);
  };

  return (
    <div>
      <PageHeader title="Media Management" />

      <div className="space-y-6 max-w-2xl">
        {/* Book Naming */}
        <Card>
          <CardHeader>
            <CardTitle>Book Naming</CardTitle>
            <CardDescription>
              Configure how book files and folders are named.
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
              <Switch checked={renameBooks} onCheckedChange={setRenameBooks} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Replace Illegal Characters</Label>
                <p className="text-sm text-muted-foreground">
                  Replace characters that are not allowed in file paths.
                </p>
              </div>
              <Switch
                checked={replaceIllegalCharacters}
                onCheckedChange={setReplaceIllegalCharacters}
              />
            </div>

            <div className="space-y-2">
              <Label>Standard Book Format</Label>
              <Input
                value={bookFile}
                onChange={(e) => setBookFile(e.target.value)}
                disabled={!renameBooks}
              />
              <p className="text-xs text-muted-foreground">
                Available tokens: {NAMING_TOKENS}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Author Folder Format</Label>
              <Input
                value={authorFolder}
                onChange={(e) => setAuthorFolder(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Available tokens: {NAMING_TOKENS}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Book Folder Format</Label>
              <Input
                value={bookFolder}
                onChange={(e) => setBookFolder(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Available tokens: {NAMING_TOKENS}
              </p>
            </div>
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
                checked={createEmptyAuthorFolders}
                onCheckedChange={setCreateEmptyAuthorFolders}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Delete empty author folders</Label>
                <p className="text-sm text-muted-foreground">
                  Remove author folders when they no longer contain any books.
                </p>
              </div>
              <Switch
                checked={deleteEmptyAuthorFolders}
                onCheckedChange={setDeleteEmptyAuthorFolders}
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
                checked={useHardLinks}
                onCheckedChange={setUseHardLinks}
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
                checked={skipFreeSpaceCheck}
                onCheckedChange={setSkipFreeSpaceCheck}
              />
            </div>

            {!skipFreeSpaceCheck && (
              <div className="space-y-2">
                <Label>Minimum Free Space (MB)</Label>
                <Input
                  type="number"
                  value={minimumFreeSpace}
                  onChange={(e) => setMinimumFreeSpace(Number(e.target.value))}
                  min={0}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Import Extra Files</Label>
                <p className="text-sm text-muted-foreground">
                  Import additional non-book files alongside the book.
                </p>
              </div>
              <Switch
                checked={importExtraFiles}
                onCheckedChange={setImportExtraFiles}
              />
            </div>

            {importExtraFiles && (
              <div className="space-y-2">
                <Label>Extra File Extensions</Label>
                <Input
                  value={extraFileExtensions}
                  onChange={(e) => setExtraFileExtensions(e.target.value)}
                  placeholder=".cue,.nfo,.jpg"
                />
              </div>
            )}
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
                value={propersAndRepacks}
                onValueChange={setPropersAndRepacks}
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
                <Label>Ignore Deleted Books</Label>
                <p className="text-sm text-muted-foreground">
                  Do not unmonitor books when their files are deleted from disk.
                </p>
              </div>
              <Switch
                checked={ignoreDeletedBooks}
                onCheckedChange={setIgnoreDeletedBooks}
              />
            </div>

            <div className="space-y-2">
              <Label>Change File Date</Label>
              <Select value={changeFileDate} onValueChange={setChangeFileDate}>
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
                value={recyclingBin}
                onChange={(e) => setRecyclingBin(e.target.value)}
                placeholder="Leave empty to disable"
              />
            </div>

            {recyclingBin && (
              <div className="space-y-2">
                <Label>Recycling Bin Cleanup (days)</Label>
                <Input
                  type="number"
                  value={recyclingBinCleanup}
                  onChange={(e) =>
                    setRecyclingBinCleanup(Number(e.target.value))
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
                checked={setPermissions}
                onCheckedChange={setSetPermissions}
              />
            </div>

            {setPermissions && (
              <>
                <div className="space-y-2">
                  <Label>File chmod</Label>
                  <Input
                    value={fileChmod}
                    onChange={(e) => setFileChmod(e.target.value)}
                    placeholder="0644"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Folder chmod</Label>
                  <Input
                    value={folderChmod}
                    onChange={(e) => setFolderChmod(e.target.value)}
                    placeholder="0755"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>chown Group</Label>
                  <Input
                    value={chownGroup}
                    onChange={(e) => setChownGroup(e.target.value)}
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
                No root folders configured. Add a root folder path in your
                download profiles.
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

        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
