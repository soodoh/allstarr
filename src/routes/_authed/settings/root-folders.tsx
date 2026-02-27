import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FolderOpen, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import PageHeader from "src/components/shared/page-header";
import DirectoryBrowserDialog from "src/components/shared/directory-browser-dialog";
import { rootFoldersListQuery } from "src/lib/queries";
import { useCreateRootFolder, useDeleteRootFolder } from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/root-folders")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(rootFoldersListQuery()),
  component: RootFoldersPage,
});

function formatBytes(bytes: number | null) {
  if (!bytes) {
    return "N/A";
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function RootFoldersPage() {
  const { data: folders } = useSuspenseQuery(rootFoldersListQuery());
  const createRootFolder = useCreateRootFolder();
  const deleteRootFolder = useDeleteRootFolder();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [browseDialogOpen, setBrowseDialogOpen] = useState(false);
  const [browseInitialPath, setBrowseInitialPath] = useState("/");

  const handleRowClick = (path: string) => {
    setBrowseInitialPath(path);
    setBrowseDialogOpen(true);
  };

  const handleSelect = (path: string) => {
    createRootFolder.mutate(path, {
      onSuccess: () => setDialogOpen(false),
    });
  };

  const handleDelete = (id: number) => {
    deleteRootFolder.mutate(id);
  };

  return (
    <div>
      <PageHeader
        title="Root Folders"
        description="Manage root folders for your library"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Add Folder
          </Button>
        }
      />

      <div className="space-y-6 max-w-2xl">
        {folders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No root folders configured. Add one above.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead>Free Space</TableHead>
                <TableHead>Total Space</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map((folder) => (
                <TableRow
                  key={folder.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    // Avoid triggering row click when clicking the delete button
                    if ((e.target as HTMLElement).closest("button")) {
                      return;
                    }
                    handleRowClick(folder.path);
                  }}
                >
                  <TableCell className="font-mono text-sm">
                    {folder.path}
                  </TableCell>
                  <TableCell>{formatBytes(folder.freeSpace)}</TableCell>
                  <TableCell>{formatBytes(folder.totalSpace)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(folder.id)}
                      disabled={deleteRootFolder.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DirectoryBrowserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={handleSelect}
      />

      <DirectoryBrowserDialog
        open={browseDialogOpen}
        onOpenChange={setBrowseDialogOpen}
        initialPath={browseInitialPath}
        onSelect={() => setBrowseDialogOpen(false)}
      />
    </div>
  );
}
