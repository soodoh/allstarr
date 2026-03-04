import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import PageHeader from "src/components/shared/page-header";
import IndexerList from "src/components/indexers/indexer-list";
import IndexerForm from "src/components/indexers/indexer-form";
import SyncedIndexerViewDialog from "src/components/indexers/synced-indexer-view-dialog";
import type { IndexerFormValues } from "src/components/indexers/indexer-form";
import { indexersListQuery, syncedIndexersListQuery } from "src/lib/queries";
import {
  useCreateIndexer,
  useUpdateIndexer,
  useDeleteIndexer,
} from "src/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/indexers")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(indexersListQuery());
    await context.queryClient.ensureQueryData(syncedIndexersListQuery());
  },
  component: IndexersPage,
});

const toSettings = (categories: number[]) =>
  categories.length > 0 ? { categories } : null;

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
  const [viewingSynced, setViewingSynced] = useState<SyncedIndexer | null>(
    null,
  );

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
        enableRss: values.enableRss,
        enableAutomaticSearch: values.enableAutomaticSearch,
        enableInteractiveSearch: values.enableInteractiveSearch,
        priority: values.priority,
        host: values.host,
        port: values.port,
        useSsl: values.useSsl,
        urlBase: values.urlBase || null,
        apiKey: values.apiKey,
        settings: toSettings(values.categories),
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
        enableRss: values.enableRss,
        enableAutomaticSearch: values.enableAutomaticSearch,
        enableInteractiveSearch: values.enableInteractiveSearch,
        priority: values.priority,
        host: values.host,
        port: values.port,
        useSsl: values.useSsl,
        urlBase: values.urlBase || null,
        apiKey: values.apiKey,
        settings: toSettings(values.categories),
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
        enableRss: editing.enableRss,
        enableAutomaticSearch: editing.enableAutomaticSearch,
        enableInteractiveSearch: editing.enableInteractiveSearch,
        host: editing.host,
        port: editing.port,
        useSsl: editing.useSsl,
        urlBase: editing.urlBase ?? "",
        apiKey: editing.apiKey,
        priority: editing.priority,
        categories:
          (editing.settings as { categories?: number[] } | null)?.categories ??
          [],
      }
    : undefined;

  return (
    <div className="space-y-10">
      <div>
        <PageHeader
          title="Indexers"
          description="Manage manual and synced Prowlarr connections for finding book releases"
          actions={<Button onClick={handleOpenAdd}>Add Indexer</Button>}
        />

        <IndexerList
          indexers={indexersList}
          syncedIndexers={syncedList}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewSynced={setViewingSynced}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Indexer" : "Add Indexer"}
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

      <SyncedIndexerViewDialog
        indexer={viewingSynced}
        onOpenChange={(open) => {
          if (!open) {
            setViewingSynced(null);
          }
        }}
      />
    </div>
  );
}
