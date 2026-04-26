import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { DownloadClientFormValues } from "src/components/settings/download-clients/download-client-form";
import DownloadClientForm from "src/components/settings/download-clients/download-client-form";
import DownloadClientList from "src/components/settings/download-clients/download-client-list";
import ImplementationSelect from "src/components/settings/download-clients/implementation-select";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import {
	useCreateDownloadClient,
	useDeleteDownloadClient,
	useUpdateDownloadClient,
	useUpdateSettings,
} from "src/hooks/mutations";
import { requireAdminBeforeLoad } from "src/lib/admin-route";
import { downloadClientsListQuery, settingsMapQuery } from "src/lib/queries";

type ImplementationType =
	| "qBittorrent"
	| "Transmission"
	| "Deluge"
	| "rTorrent"
	| "SABnzbd"
	| "NZBGet"
	| "Blackhole";

export const Route = createFileRoute("/_authed/settings/download-clients")({
	beforeLoad: requireAdminBeforeLoad,
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(downloadClientsListQuery()),
			context.queryClient.ensureQueryData(settingsMapQuery()),
		]);
	},
	component: DownloadClientsPage,
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

function DownloadClientsPage() {
	const { data: clients } = useSuspenseQuery(downloadClientsListQuery());
	const { data: settings } = useSuspenseQuery(settingsMapQuery());

	const createClient = useCreateDownloadClient();
	const updateClient = useUpdateDownloadClient();
	const deleteClient = useDeleteDownloadClient();
	const updateSettings = useUpdateSettings();

	// Completed Download Handling
	const [enableCompleted, setEnableCompleted] = useState(
		getSetting(
			settings,
			"downloadClient.enableCompletedDownloadHandling",
			true,
		),
	);

	// Failed Download Handling
	const [redownloadFailed, setRedownloadFailed] = useState(
		getSetting(settings, "downloadClient.redownloadFailed", true),
	);
	const [removeFailed, setRemoveFailed] = useState(
		getSetting(settings, "downloadClient.removeFailed", true),
	);

	const handleSaveSettings = () => {
		updateSettings.mutate([
			{
				key: "downloadClient.enableCompletedDownloadHandling",
				value: enableCompleted,
			},
			{
				key: "downloadClient.redownloadFailed",
				value: redownloadFailed,
			},
			{ key: "downloadClient.removeFailed", value: removeFailed },
		]);
	};

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
				removeCompletedDownloads: values.removeCompletedDownloads,
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
				removeCompletedDownloads: values.removeCompletedDownloads,
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
				removeCompletedDownloads: editing.removeCompletedDownloads,
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

			<div className="space-y-6 max-w-2xl mb-6">
				{/* Completed Download Handling */}
				<Card>
					<CardHeader>
						<CardTitle>Completed Download Handling</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Enable</Label>
								<p className="text-sm text-muted-foreground">
									Automatically import completed downloads from the download
									client
								</p>
							</div>
							<Switch
								checked={enableCompleted}
								onCheckedChange={setEnableCompleted}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Failed Download Handling */}
				<Card>
					<CardHeader>
						<CardTitle>Failed Download Handling</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Redownload</Label>
								<p className="text-sm text-muted-foreground">
									Automatically search for another release when a download fails
								</p>
							</div>
							<Switch
								checked={redownloadFailed}
								onCheckedChange={setRedownloadFailed}
							/>
						</div>

						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Remove</Label>
								<p className="text-sm text-muted-foreground">
									Automatically remove failed downloads from the download client
								</p>
							</div>
							<Switch
								checked={removeFailed}
								onCheckedChange={setRemoveFailed}
							/>
						</div>
					</CardContent>
				</Card>

				<Button
					onClick={handleSaveSettings}
					disabled={updateSettings.isPending}
				>
					{updateSettings.isPending ? "Saving..." : "Save Settings"}
				</Button>
			</div>

			<DownloadClientList
				clients={clients}
				onEdit={handleEdit}
				onDelete={handleDelete}
			/>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-w-lg" aria-describedby={undefined}>
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
