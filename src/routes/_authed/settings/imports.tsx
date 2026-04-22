import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Database, ListChecks } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import { requireAdminBeforeLoad } from "src/lib/admin-route";
import { importSourcesQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/settings/imports")({
	beforeLoad: requireAdminBeforeLoad,
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(importSourcesQuery()),
	component: ImportsPage,
});

function formatSourceKind(kind: string) {
	return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function ImportsPage() {
	const { data: sources } = useSuspenseQuery(importSourcesQuery());

	return (
		<div className="space-y-8">
			<PageHeader
				title="Imports"
				description="Connect Servarr sources, inspect planned changes, and resolve review items before applying them."
			/>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Card className="xl:col-span-1">
					<CardHeader>
						<CardTitle>Sources</CardTitle>
						<CardDescription>
							Connected import sources are loaded here first so Task 6 can layer
							on the full management UI.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{sources.length === 0 ? (
							<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
								No import sources yet. Add a Servarr or Bookshelf connection to
								start building plans.
							</div>
						) : (
							sources.map((source) => (
								<div
									key={source.id}
									className="rounded-lg border bg-background p-4"
								>
									<div className="flex items-start gap-3">
										<Database className="mt-0.5 h-4 w-4 text-primary" />
										<div className="min-w-0 space-y-1">
											<div className="font-medium">{source.label}</div>
											<div className="text-sm text-muted-foreground">
												{formatSourceKind(source.kind)} • {source.baseUrl}
											</div>
											<div className="text-sm text-muted-foreground">
												Status: {source.lastSyncStatus}
											</div>
											<div className="text-sm text-muted-foreground">
												API key {source.hasApiKey ? "configured" : "missing"}
											</div>
											{source.lastSyncError ? (
												<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
													<AlertTriangle className="mt-0.5 h-4 w-4" />
													<span>{source.lastSyncError}</span>
												</div>
											) : null}
										</div>
									</div>
								</div>
							))
						)}
					</CardContent>
				</Card>

				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Plan</CardTitle>
							<CardDescription>
								<ListChecks className="inline-block h-4 w-4" /> Task 6 will wire
								the import plan table and row selection here.
							</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							This shell already loads the connected sources so the plan view
							can stay in sync with source refreshes.
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Review</CardTitle>
							<CardDescription>
								Resolve unresolved items and confirm any manual adjustments.
							</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							Review actions will attach to the shared imports cache and reuse
							the same invalidation path as source CRUD.
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
