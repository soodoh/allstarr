import type { JSX } from "react";
import { useState } from "react";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import { useRemoveFromQueue } from "src/hooks/mutations";
import type { QueueItem } from "src/server/queue";

type RemoveDownloadDialogProps = {
	item: QueueItem | null;
	onOpenChange: (open: boolean) => void;
};

export default function RemoveDownloadDialog({
	item,
	onOpenChange,
}: RemoveDownloadDialogProps): JSX.Element {
	const [removeFromClient, setRemoveFromClient] = useState(true);
	const [addToBlocklist, setAddToBlocklist] = useState(false);
	const mutation = useRemoveFromQueue();

	function handleClose(open: boolean) {
		if (!open) {
			setRemoveFromClient(true);
			setAddToBlocklist(false);
		}
		onOpenChange(open);
	}

	function handleRemove() {
		if (!item) {
			return;
		}
		mutation.mutate(
			{
				downloadClientId: item.downloadClientId,
				downloadItemId: item.id,
				removeFromClient,
				addToBlocklist,
				sourceTitle: item.name,
				protocol: item.protocol as "torrent" | "usenet",
			},
			{ onSuccess: () => handleClose(false) },
		);
	}

	return (
		<Dialog open={item !== null} onOpenChange={handleClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Download</DialogTitle>
					<DialogDescription className="break-all">
						Remove &ldquo;{item?.name}&rdquo; from the download queue?
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="flex flex-col gap-3 py-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="remove-from-client"
								checked={removeFromClient}
								onCheckedChange={(v: boolean) => setRemoveFromClient(v)}
							/>
							<Label htmlFor="remove-from-client">
								Remove from download client
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<Checkbox
								id="add-to-blocklist"
								checked={addToBlocklist}
								onCheckedChange={(v: boolean) => setAddToBlocklist(v)}
							/>
							<Label htmlFor="add-to-blocklist">Add release to blocklist</Label>
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => handleClose(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleRemove}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Removing..." : "Remove"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
