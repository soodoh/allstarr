import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import UnmappedFilesTable from "src/components/unmapped-files/unmapped-files-table";
import { unmappedFilesListQuery } from "src/lib/queries";
import { queryKeys } from "src/lib/query-keys";
import { rescanAllRootFoldersFn } from "src/server/unmapped-files";

export const Route = createFileRoute("/_authed/unmapped-files")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(unmappedFilesListQuery()),
	component: UnmappedFilesPage,
	pendingComponent: TableSkeleton,
});

function UnmappedFilesPage() {
	const queryClient = useQueryClient();
	const [rescanning, setRescanning] = useState(false);

	const handleRescanAll = async () => {
		setRescanning(true);
		try {
			await rescanAllRootFoldersFn();
			queryClient.invalidateQueries({
				queryKey: queryKeys.unmappedFiles.all,
			});
			toast.success("Rescan complete");
		} catch {
			toast.error("Rescan failed");
		} finally {
			setRescanning(false);
		}
	};

	return (
		<div>
			<PageHeader
				title="Unmapped Files"
				description="Files found in root folders that aren't linked to any library entry"
				actions={
					<Button
						variant="outline"
						size="sm"
						onClick={handleRescanAll}
						disabled={rescanning}
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${rescanning ? "animate-spin" : ""}`}
						/>
						{rescanning ? "Rescanning..." : "Rescan All"}
					</Button>
				}
			/>
			<Suspense fallback={<TableSkeleton />}>
				<UnmappedFilesTable />
			</Suspense>
		</div>
	);
}
