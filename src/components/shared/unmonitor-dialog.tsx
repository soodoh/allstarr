import { Loader2 } from "lucide-react";
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

type UnmonitorDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	profileName: string;
	itemTitle: string;
	itemType:
		| "book"
		| "episode"
		| "season"
		| "show"
		| "movie"
		| "author"
		| "manga"
		| "volume"
		| "chapter";
	fileCount: number;
	onConfirm: (deleteFiles: boolean) => void;
	isPending: boolean;
};

export default function UnmonitorDialog({
	open,
	onOpenChange,
	profileName,
	itemTitle,
	itemType,
	fileCount,
	onConfirm,
	isPending,
}: UnmonitorDialogProps): JSX.Element {
	const [deleteFiles, setDeleteFiles] = useState(false);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setDeleteFiles(false);
		}
		onOpenChange(nextOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Unmonitor {profileName}?</DialogTitle>
					<DialogDescription>
						This will stop searching for {itemType} &ldquo;{itemTitle}&rdquo;
						for this profile.
					</DialogDescription>
				</DialogHeader>

				<DialogBody>
					{fileCount > 0 && (
						<div className="flex items-center gap-2">
							<Checkbox
								id="delete-files"
								checked={deleteFiles}
								onCheckedChange={(checked) => setDeleteFiles(checked === true)}
							/>
							<Label htmlFor="delete-files" className="cursor-pointer">
								Also delete {fileCount} file(s)
							</Label>
						</div>
					)}
				</DialogBody>

				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => onConfirm(deleteFiles)}
						disabled={isPending}
					>
						{isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
