import { Pencil, Trash2 } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";

import type { downloadClients } from "src/db/schema";

type DownloadClient = typeof downloadClients.$inferSelect;

type DownloadClientListProps = {
	clients: DownloadClient[];
	onEdit: (client: DownloadClient) => void;
	onDelete: (id: number) => void;
};

export default function DownloadClientList({
	clients,
	onEdit,
	onDelete,
}: DownloadClientListProps): JSX.Element {
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const deleteName = deleteId
		? clients.find((c) => c.id === deleteId)?.name
		: undefined;

	if (clients.length === 0) {
		return (
			<div className="text-center py-8 text-muted-foreground">
				No download clients configured. Add one to get started.
			</div>
		);
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Host</TableHead>
						<TableHead>Protocol</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="w-24">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{clients.map((client) => (
						<TableRow key={client.id}>
							<TableCell className="font-medium">{client.name}</TableCell>
							<TableCell>{client.implementation}</TableCell>
							<TableCell className="text-muted-foreground">
								{client.host}:{client.port}
							</TableCell>
							<TableCell>
								<Badge
									variant={
										client.protocol === "torrent" ? "default" : "secondary"
									}
								>
									{client.protocol}
								</Badge>
							</TableCell>
							<TableCell>
								<Badge variant={client.enabled ? "default" : "outline"}>
									{client.enabled ? "Enabled" : "Disabled"}
								</Badge>
							</TableCell>
							<TableCell>
								<div className="flex gap-1">
									<Button
										variant="ghost"
										size="icon"
										onClick={() => onEdit(client)}
									>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => setDeleteId(client.id)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			<ConfirmDialog
				open={deleteId !== null}
				onOpenChange={(open) => !open && setDeleteId(null)}
				title="Delete Download Client"
				description={`Are you sure you want to delete "${deleteName}"? This action cannot be undone.`}
				onConfirm={() => {
					if (deleteId !== null) {
						onDelete(deleteId);
						setDeleteId(null);
					}
				}}
			/>
		</>
	);
}
