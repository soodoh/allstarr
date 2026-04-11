import { Loader2 } from "lucide-react";
import { useState } from "react";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { useUpdateSeries } from "src/hooks/mutations/series";

export type DownloadProfileInfo = {
	id: number;
	name: string;
	icon: string;
};

export default function EditSeriesProfilesDialog({
	open,
	onOpenChange,
	seriesId,
	seriesTitle,
	downloadProfileIds,
	profiles,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	seriesId: number;
	seriesTitle: string;
	downloadProfileIds: number[];
	profiles: DownloadProfileInfo[];
}) {
	const updateSeries = useUpdateSeries();
	const [selectedIds, setSelectedIds] = useState<number[]>(downloadProfileIds);

	const handleToggle = (id: number) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
		);
	};

	const handleSave = () => {
		updateSeries.mutate(
			{ id: seriesId, downloadProfileIds: selectedIds },
			{ onSuccess: () => onOpenChange(false) },
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>Edit Profiles for {seriesTitle}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<ProfileCheckboxGroup
						profiles={profiles}
						selectedIds={selectedIds}
						onToggle={handleToggle}
					/>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={updateSeries.isPending}>
						{updateSeries.isPending ? (
							<Loader2 className="h-4 w-4 animate-spin mr-2" />
						) : null}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
