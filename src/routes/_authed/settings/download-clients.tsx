import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import PageHeader from "src/components/shared/page-header";
import DownloadClientList from "src/components/settings/download-clients/download-client-list";
import DownloadClientForm from "src/components/settings/download-clients/download-client-form";
import type { DownloadClientFormValues } from "src/components/settings/download-clients/download-client-form";
import ImplementationSelect from "src/components/settings/download-clients/implementation-select";
import { downloadClientsListQuery } from "src/lib/queries";
import {
  useCreateDownloadClient,
  useUpdateDownloadClient,
  useDeleteDownloadClient,
} from "src/hooks/mutations";

type ImplementationType =
  | "qBittorrent"
  | "Transmission"
  | "Deluge"
  | "rTorrent"
  | "SABnzbd"
  | "NZBGet"
  | "Blackhole";

export const Route = createFileRoute("/_authed/settings/download-clients")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(downloadClientsListQuery()),
  component: DownloadClientsPage,
});

function DownloadClientsPage() {
  const { data: clients } = useSuspenseQuery(downloadClientsListQuery());

  const createClient = useCreateDownloadClient();
  const updateClient = useUpdateDownloadClient();
  const deleteClient = useDeleteDownloadClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectingImpl, setSelectingImpl] = useState(false);
  const [selectedImpl, setSelectedImpl] = useState<
    ImplementationType | undefined
  >(undefined);
  const [editing, setEditing] = useState<(typeof clients)[number] | undefined>(
    undefined,
  );

  const loading = createClient.isPending || updateClient.isPending;

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

  const handleBackToImplSelect = () => {
    setSelectedImpl(undefined);
    setSelectingImpl(true);
  };

  const handleCreate = (values: DownloadClientFormValues) => {
    createClient.mutate(
      {
        name: values.name,
        implementation: values.implementation,
        protocol: values.protocol,
        enabled: values.enabled,
        priority: values.priority,
        host: values.host,
        port: values.port,
        useSsl: values.useSsl,
        urlBase: values.urlBase || null,
        username: values.username || null,
        password: values.password || null,
        apiKey: values.apiKey || null,
        category: values.category,
        tag: values.tag || null,
        settings: values.watchFolder
          ? { watchFolder: values.watchFolder }
          : null,
      },
      { onSuccess: handleCloseDialog },
    );
  };

  const handleUpdate = (values: DownloadClientFormValues) => {
    if (!editing) {
      return;
    }
    updateClient.mutate(
      {
        id: editing.id,
        name: values.name,
        implementation: values.implementation,
        protocol: values.protocol,
        enabled: values.enabled,
        priority: values.priority,
        host: values.host,
        port: values.port,
        useSsl: values.useSsl,
        urlBase: values.urlBase || null,
        username: values.username || null,
        password: values.password || null,
        apiKey: values.apiKey || null,
        category: values.category,
        tag: values.tag || null,
        settings: values.watchFolder
          ? { watchFolder: values.watchFolder }
          : null,
      },
      { onSuccess: handleCloseDialog },
    );
  };

  const handleDelete = (id: number) => {
    deleteClient.mutate(id);
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
        tag: editing.tag ?? "",
        priority: editing.priority,
        watchFolder:
          (editing.settings as { watchFolder?: string } | undefined)
            ?.watchFolder ?? "",
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
              initialValues={
                editingInitialValues ?? { implementation: selectedImpl }
              }
              onSubmit={editing ? handleUpdate : handleCreate}
              onCancel={editing ? handleCloseDialog : handleBackToImplSelect}
              cancelLabel={editing ? "Cancel" : "Back"}
              loading={loading}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
