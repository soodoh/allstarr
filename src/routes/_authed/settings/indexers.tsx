import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { IndexerFormValues } from "src/components/settings/indexers/indexer-form";
import IndexerForm from "src/components/settings/indexers/indexer-form";
import IndexerImplementationSelect from "src/components/settings/indexers/indexer-implementation-select";
import IndexerList from "src/components/settings/indexers/indexer-list";
import SyncedIndexerEditDialog from "src/components/settings/indexers/synced-indexer-view-dialog";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import {
	useCreateIndexer,
	useDeleteIndexer,
	useUpdateIndexer,
	useUpdateSyncedIndexer,
} from "src/hooks/mutations";
import { requireAdminBeforeLoad } from "src/lib/admin-route";
import {
	downloadClientsListQuery,
	indexerStatusesQuery,
	indexersListQuery,
	syncedIndexersListQuery,
} from "src/lib/queries";

export const Route = createFileRoute("/_authed/settings/indexers")({
	beforeLoad: requireAdminBeforeLoad,
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(indexersListQuery()),
			context.queryClient.ensureQueryData(syncedIndexersListQuery()),
			context.queryClient.ensureQueryData(downloadClientsListQuery()),
			context.queryClient.ensureQueryData(indexerStatusesQuery()),
		]);
	},
	component: IndexersPage,
});

function parseCategories(raw: string | null): number[] {
	try {
		return JSON.parse(raw ?? "[]") as number[];
	} catch {
		return [];
	}
}

type AddStep =
	| { step: "select" }
	| {
			step: "form";
			implementation: "Newznab" | "Torznab";
			protocol: "usenet" | "torrent";
	  };

function IndexersPage() {
	const { data: indexersList } = useSuspenseQuery(indexersListQuery());
	const { data: syncedList } = useSuspenseQuery(syncedIndexersListQuery());
	const { data: downloadClientsList } = useSuspenseQuery(
		downloadClientsListQuery(),
	);
	const { data: indexerStatuses } = useSuspenseQuery(indexerStatusesQuery());

	const createIndexer = useCreateIndexer();
	const updateIndexer = useUpdateIndexer();
	const deleteIndexer = useDeleteIndexer();
	const updateSyncedIndexer = useUpdateSyncedIndexer();

	const [dialogOpen, setDialogOpen] = useState(false);
	const [addStep, setAddStep] = useState<AddStep>({ step: "select" });
	const [editing, setEditing] = useState<
		(typeof indexersList)[number] | undefined
	>(undefined);
	const [viewingSynced, setViewingSynced] = useState<SyncedIndexer | null>(
		null,
	);

	const loading = createIndexer.isPending || updateIndexer.isPending;

	const handleOpenAdd = () => {
		setEditing(undefined);
		setAddStep({ step: "select" });
		setDialogOpen(true);
	};

	const handleEdit = (indexer: { id: number }) => {
		const fullIndexer = indexersList.find((i) => i.id === indexer.id);
		if (!fullIndexer) {
			return;
		}
		setEditing(fullIndexer);
		setAddStep({
			step: "form",
			implementation: fullIndexer.implementation as "Newznab" | "Torznab",
			protocol: fullIndexer.protocol as "usenet" | "torrent",
		});
		setDialogOpen(true);
	};

	const handleCloseDialog = () => {
		setDialogOpen(false);
		setEditing(undefined);
		setAddStep({ step: "select" });
	};

	const handleCreate = (values: IndexerFormValues) => {
		createIndexer.mutate(
			{ ...values, tag: values.tag || null },
			{ onSuccess: handleCloseDialog },
		);
	};

	const handleUpdate = (values: IndexerFormValues) => {
		if (!editing) {
			return;
		}
		updateIndexer.mutate(
			{ ...values, id: editing.id, tag: values.tag || null },
			{ onSuccess: handleCloseDialog },
		);
	};

	const handleDelete = (id: number) => {
		deleteIndexer.mutate(id);
	};

	const handleUpdateSynced = (
		id: number,
		downloadClientId: number | null,
		tag: string | null,
		requestInterval: number,
		dailyQueryLimit: number,
		dailyGrabLimit: number,
	) => {
		updateSyncedIndexer.mutate(
			{
				id,
				downloadClientId,
				tag,
				requestInterval,
				dailyQueryLimit,
				dailyGrabLimit,
			},
			{ onSuccess: () => setViewingSynced(null) },
		);
	};

	const editingInitialValues = editing
		? {
				name: editing.name,
				implementation: editing.implementation as "Newznab" | "Torznab",
				protocol: editing.protocol as "usenet" | "torrent",
				baseUrl: editing.baseUrl,
				apiPath: editing.apiPath ?? "/api",
				apiKey: editing.apiKey,
				categories: parseCategories(editing.categories),
				enableRss: editing.enableRss,
				enableAutomaticSearch: editing.enableAutomaticSearch,
				enableInteractiveSearch: editing.enableInteractiveSearch,
				priority: editing.priority,
				tag: editing.tag ?? "",
				downloadClientId: editing.downloadClientId ?? null,
				requestInterval: (editing.requestInterval ?? 5000) / 1000,
				dailyQueryLimit: editing.dailyQueryLimit ?? 0,
				dailyGrabLimit: editing.dailyGrabLimit ?? 0,
			}
		: undefined;

	let dialogTitle = "Add Indexer";
	if (editing) {
		dialogTitle = "Edit Indexer";
	} else if (addStep.step === "form") {
		dialogTitle = `Add ${addStep.implementation} Indexer`;
	}

	return (
		<div className="space-y-10">
			<div>
				<PageHeader
					title="Indexers"
					description="Manage Newznab and Torznab indexers for finding book releases"
					actions={<Button onClick={handleOpenAdd}>Add Indexer</Button>}
				/>

				<IndexerList
					indexers={indexersList}
					syncedIndexers={syncedList}
					statuses={indexerStatuses}
					onEdit={handleEdit}
					onDelete={handleDelete}
					onViewSynced={setViewingSynced}
				/>
			</div>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{dialogTitle}</DialogTitle>
					</DialogHeader>

					{!editing && addStep.step === "select" ? (
						<IndexerImplementationSelect
							onSelect={({ implementation, protocol }) =>
								setAddStep({ step: "form", implementation, protocol })
							}
							onCancel={handleCloseDialog}
						/>
					) : (
						<IndexerForm
							implementation={
								addStep.step === "form"
									? addStep.implementation
									: ((editing?.implementation as "Newznab" | "Torznab") ??
										"Newznab")
							}
							protocol={
								addStep.step === "form"
									? addStep.protocol
									: ((editing?.protocol as "usenet" | "torrent") ?? "usenet")
							}
							initialValues={editingInitialValues}
							downloadClients={downloadClientsList}
							onSubmit={editing ? handleUpdate : handleCreate}
							onCancel={handleCloseDialog}
							loading={loading}
						/>
					)}
				</DialogContent>
			</Dialog>

			<SyncedIndexerEditDialog
				indexer={viewingSynced}
				downloadClients={downloadClientsList}
				onSave={handleUpdateSynced}
				onOpenChange={(open) => {
					if (!open) {
						setViewingSynced(null);
					}
				}}
				loading={updateSyncedIndexer.isPending}
			/>
		</div>
	);
}
