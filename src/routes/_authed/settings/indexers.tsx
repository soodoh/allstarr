import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import PageHeader from "~/components/shared/page-header";
import IndexerList from "~/components/indexers/indexer-list";
import IndexerForm from "~/components/indexers/indexer-form";
import type { IndexerFormValues } from "~/components/indexers/indexer-form";
import { indexersListQuery, syncedIndexersListQuery } from "~/lib/queries";
import {
  useCreateIndexer,
  useUpdateIndexer,
  useDeleteIndexer,
} from "~/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/indexers")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(indexersListQuery());
    await context.queryClient.ensureQueryData(syncedIndexersListQuery());
  },
  component: IndexersPage,
});

function IndexersPage() {
  const { data: indexersList } = useSuspenseQuery(indexersListQuery());
  const { data: syncedList } = useSuspenseQuery(syncedIndexersListQuery());

  const createIndexer = useCreateIndexer();
  const updateIndexer = useUpdateIndexer();
  const deleteIndexer = useDeleteIndexer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<
    (typeof indexersList)[number] | undefined
  >(undefined);

  const loading = createIndexer.isPending || updateIndexer.isPending;

  const handleOpenAdd = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (indexer: {
    id: number;
    name: string;
    host: string;
    port: number;
    priority: number;
    enabled: boolean;
  }) => {
    // Find the full indexer from the list to include all fields (e.g., apiKey)
    const fullIndexer = indexersList.find((i) => i.id === indexer.id);
    if (!fullIndexer) {
      return;
    }
    setEditing(fullIndexer);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditing(undefined);
  };

  const handleCreate = (values: IndexerFormValues) => {
    createIndexer.mutate(
      {
        name: values.name,
        enabled: values.enabled,
        priority: values.priority,
        host: values.host,
        port: values.port,
        useSsl: values.useSsl,
        urlBase: values.urlBase || undefined,
        apiKey: values.apiKey,
      },
      { onSuccess: handleCloseDialog },
    );
  };

  const handleUpdate = (values: IndexerFormValues) => {
    if (!editing) {
      return;
    }
    updateIndexer.mutate(
      {
        id: editing.id,
        name: values.name,
        enabled: values.enabled,
        priority: values.priority,
        host: values.host,
        port: values.port,
        useSsl: values.useSsl,
        urlBase: values.urlBase || undefined,
        apiKey: values.apiKey,
      },
      { onSuccess: handleCloseDialog },
    );
  };

  const handleDelete = (id: number) => {
    deleteIndexer.mutate(id);
  };

  const editingInitialValues = editing
    ? {
        name: editing.name,
        enabled: editing.enabled,
        host: editing.host,
        port: editing.port,
        useSsl: editing.useSsl,
        urlBase: editing.urlBase ?? "",
        apiKey: editing.apiKey,
        priority: editing.priority,
      }
    : undefined;

  return (
    <div className="space-y-10">
      <div>
        <PageHeader
          title="Indexers"
          description="Configure connections to Prowlarr for finding book releases"
          actions={<Button onClick={handleOpenAdd}>Add Indexer</Button>}
        />

        <IndexerList
          indexers={indexersList}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Synced Indexers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Indexers pushed automatically by Prowlarr via App Sync. These are
            read-only — manage them in Prowlarr.
          </p>
        </div>

        {syncedList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No synced indexers yet. Configure Allstarr as a Readarr application
            in Prowlarr → Settings → Apps to enable automatic sync.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead>RSS</TableHead>
                <TableHead>Search</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncedList.map((indexer) => (
                <TableRow key={indexer.id}>
                  <TableCell className="font-medium">{indexer.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {indexer.protocol}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-64 truncate">
                    {indexer.baseUrl}
                  </TableCell>
                  <TableCell>{indexer.priority}</TableCell>
                  <TableCell>
                    <Badge variant={indexer.enableRss ? "default" : "outline"}>
                      {indexer.enableRss ? "On" : "Off"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        indexer.enableAutomaticSearch ? "default" : "outline"
                      }
                    >
                      {indexer.enableAutomaticSearch ? "On" : "Off"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Indexer" : "Add Prowlarr Indexer"}
            </DialogTitle>
          </DialogHeader>

          <IndexerForm
            initialValues={editingInitialValues}
            onSubmit={editing ? handleUpdate : handleCreate}
            onCancel={handleCloseDialog}
            loading={loading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
