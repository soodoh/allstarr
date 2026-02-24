import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  getIndexersFn,
  createIndexerFn,
  updateIndexerFn,
  deleteIndexerFn,
} from "~/server/indexers";

export const Route = createFileRoute("/_authed/settings/indexers")({
  loader: async () => {
    return getIndexersFn();
  },
  component: IndexersPage,
});

function IndexersPage() {
  const indexersList = Route.useLoaderData();
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<
    (typeof indexersList)[number] | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);

  const handleOpenAdd = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (indexer: (typeof indexersList)[number]) => {
    setEditing(indexer);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditing(undefined);
  };

  const handleCreate = async (values: IndexerFormValues) => {
    setLoading(true);
    try {
      await createIndexerFn({
        data: {
          name: values.name,
          enabled: values.enabled,
          priority: values.priority,
          host: values.host,
          port: values.port,
          useSsl: values.useSsl,
          urlBase: values.urlBase || undefined,
          apiKey: values.apiKey,
        },
      });
      toast.success("Indexer added");
      handleCloseDialog();
      router.invalidate();
    } catch {
      toast.error("Failed to add indexer");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (values: IndexerFormValues) => {
    if (!editing) {return;}
    setLoading(true);
    try {
      await updateIndexerFn({
        data: {
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
      });
      toast.success("Indexer updated");
      handleCloseDialog();
      router.invalidate();
    } catch {
      toast.error("Failed to update indexer");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteIndexerFn({ data: { id } });
      toast.success("Indexer deleted");
      router.invalidate();
    } catch {
      toast.error("Failed to delete indexer");
    }
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
