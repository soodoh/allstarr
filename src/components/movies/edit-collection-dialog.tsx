import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import Switch from "src/components/ui/switch";
import { useUpdateMovieCollection } from "src/hooks/mutations/movie-collections";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";

type Collection = {
	id: number;
	title: string;
	monitored: boolean;
	minimumAvailability: string;
	downloadProfileIds: number[];
};

type Props = {
	collection: Collection | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export default function EditCollectionDialog({
	collection,
	open,
	onOpenChange,
}: Props): JSX.Element {
	const [monitored, setMonitored] = useState(false);
	const [availability, setAvailability] = useState("released");
	const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>([]);

	const { data: allProfiles = [] } = useQuery(downloadProfilesListQuery());
	const movieProfiles = useMemo(
		() => allProfiles.filter((p) => p.contentType === "movie"),
		[allProfiles],
	);

	const updateCollection = useUpdateMovieCollection();

	useEffect(() => {
		if (collection) {
			setMonitored(collection.monitored);
			setAvailability(collection.minimumAvailability);
			setSelectedProfileIds(collection.downloadProfileIds);
		}
	}, [collection]);

	const toggleProfile = (profileId: number) => {
		setSelectedProfileIds((prev) =>
			prev.includes(profileId)
				? prev.filter((id) => id !== profileId)
				: [...prev, profileId],
		);
	};

	const handleSave = () => {
		if (!collection) {
			return;
		}
		updateCollection.mutate(
			{
				id: collection.id,
				monitored,
				minimumAvailability: availability as
					| "announced"
					| "inCinemas"
					| "released",
				downloadProfileIds: selectedProfileIds,
			},
			{ onSuccess: () => onOpenChange(false) },
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit {collection?.title}</DialogTitle>
				</DialogHeader>

				<DialogBody>
					<div className="space-y-4 py-4">
						<div>
							<div className="flex items-center justify-between">
								<Label htmlFor="monitored">Monitored</Label>
								<Switch
									id="monitored"
									checked={monitored}
									onCheckedChange={setMonitored}
								/>
							</div>
							<p className="text-xs text-muted-foreground mt-1">
								When monitored, new movies added to this collection on TMDB will
								be automatically added to your library.
							</p>
						</div>

						<div className="space-y-2">
							<Label>Minimum Availability</Label>
							<Select value={availability} onValueChange={setAvailability}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="announced">Announced</SelectItem>
									<SelectItem value="inCinemas">In Cinemas</SelectItem>
									<SelectItem value="released">Released</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Download Profiles</Label>
							<div className="space-y-2">
								{movieProfiles.map((profile) => (
									<div key={profile.id} className="flex items-center gap-2">
										<Checkbox
											id={`profile-${String(profile.id)}`}
											checked={selectedProfileIds.includes(profile.id)}
											onCheckedChange={() => toggleProfile(profile.id)}
										/>
										<Label htmlFor={`profile-${String(profile.id)}`}>
											{profile.name}
										</Label>
									</div>
								))}
							</div>
						</div>
					</div>
				</DialogBody>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={updateCollection.isPending}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
