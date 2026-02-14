import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { PageHeader } from "~/components/shared/page-header";
import {
  getRootFoldersFn,
  createRootFolderFn,
  deleteRootFolderFn,
} from "~/server/root-folders";

export const Route = createFileRoute("/_authed/settings/root-folders")({
  loader: () => getRootFoldersFn(),
  component: RootFoldersPage,
});

function formatBytes(bytes: number | null) {
  if (!bytes) return "N/A";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function RootFoldersPage() {
  const folders = Route.useLoaderData();
  const router = useRouter();
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) return;
    setAdding(true);
    try {
      await createRootFolderFn({ data: { path: newPath.trim() } });
      toast.success("Root folder added");
      setNewPath("");
      router.invalidate();
    } catch {
      toast.error("Failed to add root folder");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRootFolderFn({ data: { id } });
      toast.success("Root folder removed");
      router.invalidate();
    } catch {
      toast.error("Failed to remove root folder");
    }
  };

  return (
    <div>
      <PageHeader
        title="Root Folders"
        description="Manage root folders for your library"
      />

      <div className="space-y-6 max-w-2xl">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="/path/to/books"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={adding}>
            {adding ? "Adding..." : "Add"}
          </Button>
        </form>

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
                <TableRow key={folder.id}>
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
    </div>
  );
}
