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
import DownloadClientList from "~/components/download-clients/download-client-list";
import DownloadClientForm from '~/components/download-clients/download-client-form';
import type { DownloadClientFormValues } from '~/components/download-clients/download-client-form';
import ImplementationSelect from "~/components/download-clients/implementation-select";
import {
  getDownloadClientsFn,
  createDownloadClientFn,
  updateDownloadClientFn,
  deleteDownloadClientFn,
} from "~/server/download-clients";

type ImplementationType =
  | "qBittorrent"
  | "Transmission"
  | "Deluge"
  | "rTorrent"
  | "SABnzbd"
  | "NZBGet"
  | "Blackhole";

export const Route = createFileRoute("/_authed/settings/download-clients")({
  loader: async () => {
    return getDownloadClientsFn();
  },
  component: DownloadClientsPage,
});

function DownloadClientsPage() {
  const clients = Route.useLoaderData();
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectingImpl, setSelectingImpl] = useState(false);
  const [selectedImpl, setSelectedImpl] = useState<
    ImplementationType | undefined
  >(undefined);
  const [editing, setEditing] = useState<
    (typeof clients)[number] | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);

  const handleOpenAdd = () => {
    setEditing(undefined);
    setSelectedImpl(undefined);
    setSelectingImpl(true);
    setDialogOpen(true);
  };

  const handleSelectImpl = (impl: ImplementationType) => {
    setSelectedImpl(impl);
    setSelectingImpl(false);
  };

  const handleEdit = (client: (typeof clients)[number]) => {
    setEditing(client);
    setSelectedImpl(client.implementation as ImplementationType);
    setSelectingImpl(false);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditing(undefined);
    setSelectedImpl(undefined);
    setSelectingImpl(false);
  };

  const handleCreate = async (values: DownloadClientFormValues) => {
    setLoading(true);
    try {
      await createDownloadClientFn({
        data: {
          name: values.name,
          implementation: values.implementation,
          protocol: values.protocol,
          enabled: values.enabled,
          priority: values.priority,
          host: values.host,
          port: values.port,
          useSsl: values.useSsl,
          urlBase: values.urlBase || undefined,
          username: values.username || undefined,
          password: values.password || undefined,
          apiKey: values.apiKey || undefined,
          category: values.category,
          settings:
            values.watchFolder
              ? { watchFolder: values.watchFolder }
              : undefined,
        },
      });
      toast.success("Download client added");
      handleCloseDialog();
      router.invalidate();
    } catch {
      toast.error("Failed to add download client");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (values: DownloadClientFormValues) => {
    if (!editing) {
      return;
    }
    setLoading(true);
    try {
      await updateDownloadClientFn({
        data: {
          id: editing.id,
          name: values.name,
          implementation: values.implementation,
          protocol: values.protocol,
          enabled: values.enabled,
          priority: values.priority,
          host: values.host,
          port: values.port,
          useSsl: values.useSsl,
          urlBase: values.urlBase || undefined,
          username: values.username || undefined,
          password: values.password || undefined,
          apiKey: values.apiKey || undefined,
          category: values.category,
          settings:
            values.watchFolder
              ? { watchFolder: values.watchFolder }
              : undefined,
        },
      });
      toast.success("Download client updated");
      handleCloseDialog();
      router.invalidate();
    } catch {
      toast.error("Failed to update download client");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDownloadClientFn({ data: { id } });
      toast.success("Download client deleted");
      router.invalidate();
    } catch {
      toast.error("Failed to delete download client");
    }
  };

  const editingInitialValues = editing
    ? {
        implementation: editing.implementation as ImplementationType,
        name: editing.name,
        enabled: editing.enabled,
        host: editing.host,
        port: editing.port,
        useSsl: editing.useSsl,
        urlBase: editing.urlBase ?? "",
        username: editing.username ?? "",
        password: editing.password ?? "",
        apiKey: editing.apiKey ?? "",
        category: editing.category,
        priority: editing.priority,
        watchFolder:
          (
            editing.settings as
              | { watchFolder?: string }
              | undefined
          )?.watchFolder ?? "",
      }
    : undefined;

  let dialogTitle = `Add ${selectedImpl ?? "Download Client"}`;
  if (editing) {
    dialogTitle = "Edit Download Client";
  } else if (selectingImpl) {
    dialogTitle = "Select Client Type";
  }

  return (
    <div>
      <PageHeader
        title="Download Clients"
        description="Configure connections to torrent and usenet download clients"
        actions={<Button onClick={handleOpenAdd}>Add Client</Button>}
      />

      <DownloadClientList
        clients={clients}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {selectingImpl && (
            <ImplementationSelect
              onSelect={handleSelectImpl}
              onCancel={handleCloseDialog}
            />
          )}
          {!selectingImpl && selectedImpl && (
            <DownloadClientForm
              initialValues={editingInitialValues ?? { implementation: selectedImpl }}
              onSubmit={editing ? handleUpdate : handleCreate}
              onCancel={handleCloseDialog}
              loading={loading}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
