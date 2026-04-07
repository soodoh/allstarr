import { Loader2 } from "lucide-react";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Button } from "src/components/ui/button";
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
import Switch from "src/components/ui/switch";
import { useUpdateBook } from "src/hooks/mutations";

type BookEditDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bookId: number;
	bookTitle: string;
	autoSwitchEdition: boolean;
	onSuccess: () => void;
};

export default function BookEditDialog({
	open,
	onOpenChange,
	bookId,
	bookTitle,
	autoSwitchEdition,
	onSuccess,
}: BookEditDialogProps): JSX.Element {
	const [autoSwitch, setAutoSwitch] = useState(autoSwitchEdition);
	const updateBook = useUpdateBook();

	useEffect(() => {
		if (open) {
			setAutoSwitch(autoSwitchEdition);
		}
	}, [open, autoSwitchEdition]);

	const handleSave = () => {
		updateBook.mutate(
			{ id: bookId, autoSwitchEdition: autoSwitch },
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
					<DialogTitle>Edit &mdash; {bookTitle}</DialogTitle>
					<DialogDescription>Configure book-level settings.</DialogDescription>
				</DialogHeader>

				<DialogBody>
					<div className="flex items-center justify-between gap-4 py-4">
						<div className="space-y-0.5">
							<Label htmlFor="auto-switch-edition">
								Automatically switch edition
							</Label>
							<p className="text-sm text-muted-foreground">
								When enabled, the monitored edition will automatically switch to
								a better match when new editions are discovered during metadata
								refreshes.
							</p>
						</div>
						<Switch
							id="auto-switch-edition"
							checked={autoSwitch}
							onCheckedChange={setAutoSwitch}
						/>
					</div>
				</DialogBody>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={updateBook.isPending}>
						{updateBook.isPending && (
							<Loader2 className="h-4 w-4 mr-1 animate-spin" />
						)}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
