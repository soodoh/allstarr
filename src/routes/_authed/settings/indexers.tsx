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
import PageHeader from "~/components/shared/page-header";
import IndexerList from "~/components/indexers/indexer-list";
import IndexerForm from "~/components/indexers/indexer-form";
import type { IndexerFormValues } from "~/components/indexers/indexer-form";
import { indexersListQuery } from "~/lib/queries";
import {
  useCreateIndexer,
  useUpdateIndexer,
  useDeleteIndexer,
} from "~/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/indexers")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(indexersListQuery()),
  component: IndexersPage,
});

function IndexersPage() {
  const { data: indexersList } = useSuspenseQuery(indexersListQuery());

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
    if (!fullIndexer) {return;}
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
    if (!editing) {return;}
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
