import { Loader2 } from "lucide-react";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import { useDeleteBook } from "src/hooks/mutations";

type BookDeleteDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bookId: number;
	bookTitle: string;
	fileCount: number;
	foreignBookId: string | null;
	onSuccess: () => void;
};

export default function BookDeleteDialog({
	open,
	onOpenChange,
	bookId,
	bookTitle,
	fileCount,
	foreignBookId,
	onSuccess,
}: BookDeleteDialogProps): JSX.Element {
	const [deleteFiles, setDeleteFiles] = useState(false);
	const [addImportExclusion, setAddImportExclusion] = useState(true);
	const deleteBook = useDeleteBook();

	useEffect(() => {
		if (open) {
			setDeleteFiles(false);
			setAddImportExclusion(true);
		}
	}, [open]);

	const handleConfirm = () => {
		deleteBook.mutate(
			{
				id: bookId,
				deleteFiles,
				addImportExclusion: foreignBookId !== null && addImportExclusion,
			},
			{
				onSuccess: () => {
					onOpenChange(false);
					onSuccess();
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete &mdash; {bookTitle}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this book? This action cannot be
						undone.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{fileCount > 0 && (
						<div className="flex items-center gap-3">
							<Checkbox
								id="delete-files"
								checked={deleteFiles}
								onCheckedChange={(checked) => setDeleteFiles(checked === true)}
							/>
							<Label htmlFor="delete-files" className="cursor-pointer">
								Delete {fileCount} book file{fileCount === 1 ? "" : "s"} from
								disk
							</Label>
						</div>
					)}

					{foreignBookId !== null && (
						<div className="flex items-center gap-3">
							<Checkbox
								id="add-exclusion"
								checked={addImportExclusion}
								onCheckedChange={(checked) =>
									setAddImportExclusion(checked === true)
								}
							/>
							<Label htmlFor="add-exclusion" className="cursor-pointer">
								Prevent re-addition during author refresh
							</Label>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={deleteBook.isPending}
					>
						{deleteBook.isPending && (
							<Loader2 className="h-4 w-4 mr-1 animate-spin" />
						)}
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
