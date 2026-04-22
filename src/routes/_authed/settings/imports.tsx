import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ImportPlanTable from "src/components/settings/imports/import-plan-table";
import ImportReviewPanel from "src/components/settings/imports/import-review-panel";
import ImportSourceDialog, {
	type ImportSourceValues,
} from "src/components/settings/imports/import-source-dialog";
import ImportSourcesList from "src/components/settings/imports/import-sources-list";
import PageHeader from "src/components/shared/page-header";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "src/components/ui/tabs";
import {
	useCreateImportSource,
	useDeleteImportSource,
	useRefreshImportSource,
	useUpdateImportSource,
} from "src/hooks/mutations/imports";
import { requireAdminBeforeLoad } from "src/lib/admin-route";
import type { ImportSourceRecord } from "src/lib/queries";
import { importSourcesQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/settings/imports")({
	beforeLoad: requireAdminBeforeLoad,
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(importSourcesQuery()),
	component: ImportsPage,
});

function isSourceReady(source: ImportSourceRecord): boolean {
	return (
		source.hasApiKey &&
		!source.lastSyncError &&
		source.lastSyncStatus === "synced"
	);
}

function ImportsPage() {
	const { data: sources } = useSuspenseQuery(importSourcesQuery());
	const createSourceMutation = useCreateImportSource();
	const updateSourceMutation = useUpdateImportSource();
	const deleteSourceMutation = useDeleteImportSource();
	const refreshSourceMutation = useRefreshImportSource();
	const [activeTab, setActiveTab] = useState("sources");
	const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
	const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
	const [editingSource, setEditingSource] = useState<ImportSourceRecord | null>(
		null,
	);

	useEffect(() => {
		if (sources.length === 0) {
			setSelectedSourceId(null);
			return;
		}

		const selectedExists = sources.some(
			(source) => source.id === selectedSourceId && isSourceReady(source),
		);
		if (!selectedExists) {
			const firstReadySource = sources.find(isSourceReady);
			setSelectedSourceId(firstReadySource?.id ?? null);
		}
	}, [selectedSourceId, sources]);

	function handleSelectSource(sourceId: number) {
		const source = sources.find((entry) => entry.id === sourceId);
		if (!source || !isSourceReady(source)) {
			return;
		}

		setSelectedSourceId(sourceId);
	}

	function openCreateDialog() {
		setEditingSource(null);
		setSourceDialogOpen(true);
	}

	function openEditDialog(source: ImportSourceRecord) {
		setEditingSource(source);
		setSourceDialogOpen(true);
	}

	function closeDialog() {
		setSourceDialogOpen(false);
	}

	function handleSubmit(values: ImportSourceValues) {
		if (editingSource) {
			updateSourceMutation.mutate(
				{ ...values, id: editingSource.id },
				{
					onSuccess: () => {
						closeDialog();
					},
				},
			);
			return;
		}

		createSourceMutation.mutate(values, {
			onSuccess: () => {
				closeDialog();
			},
		});
	}

	function handleDeleteSource(sourceId: number) {
		deleteSourceMutation.mutate(
			{ id: sourceId },
			{
				onSuccess: () => {
					if (selectedSourceId === sourceId) {
						setSelectedSourceId(null);
					}
				},
			},
		);
	}

	function handleRefreshSource(sourceId: number) {
		refreshSourceMutation.mutate({ id: sourceId });
	}

	return (
		<div className="space-y-8">
			<PageHeader
				title="Imports"
				description="Connect Servarr sources, inspect placeholder plans, and review unresolved rows before the full read-side flow lands."
			/>

			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<div className="space-y-4">
					<TabsList>
						<TabsTrigger value="sources">Sources</TabsTrigger>
						<TabsTrigger value="plan">Plan</TabsTrigger>
						<TabsTrigger value="review">Review</TabsTrigger>
					</TabsList>

					<TabsContent value="sources" className="space-y-4">
						<ImportSourcesList
							sources={sources}
							selectedSourceId={selectedSourceId}
							refreshingSourceId={
								refreshSourceMutation.isPending
									? (refreshSourceMutation.variables?.id ?? null)
									: null
							}
							deletingSourceId={
								deleteSourceMutation.isPending
									? (deleteSourceMutation.variables?.id ?? null)
									: null
							}
							onAddSource={openCreateDialog}
							onDeleteSource={handleDeleteSource}
							onEditSource={openEditDialog}
							onRefreshSource={handleRefreshSource}
							onSelectSource={handleSelectSource}
						/>
					</TabsContent>

					<TabsContent value="plan" className="space-y-4">
						<ImportPlanTable
							sources={sources}
							selectedSourceId={selectedSourceId}
							onSelectSource={handleSelectSource}
						/>
					</TabsContent>

					<TabsContent value="review" className="space-y-4">
						<ImportReviewPanel
							sources={sources}
							selectedSourceId={selectedSourceId}
							onSelectSource={handleSelectSource}
						/>
					</TabsContent>
				</div>
			</Tabs>

			<ImportSourceDialog
				open={sourceDialogOpen}
				source={editingSource}
				loading={
					createSourceMutation.isPending || updateSourceMutation.isPending
				}
				onOpenChange={(open) => {
					setSourceDialogOpen(open);
					if (!open) {
						setEditingSource(null);
					}
				}}
				onSubmit={handleSubmit}
			/>
		</div>
	);
}
