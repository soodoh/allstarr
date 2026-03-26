import type { JSX } from "react";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { useAddMissingCollectionMovies } from "src/hooks/mutations/movie-collections";

type Collection = {
  id: number;
  title: string;
  missingMovies: number;
};

type Props = {
  collection: Collection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function AddMissingMoviesDialog({
  collection,
  open,
  onOpenChange,
}: Props): JSX.Element {
  const addMissing = useAddMissingCollectionMovies();

  const { data: allProfiles = [] } = useQuery({
    ...downloadProfilesListQuery(),
    enabled: open,
  });

  const movieProfiles = useMemo(
    () => allProfiles.filter((p) => p.contentType === "movie"),
    [allProfiles],
  );

  const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>([]);
  const [minimumAvailability, setMinimumAvailability] =
    useState<string>("released");
  const [monitorOption, setMonitorOption] = useState<
    "movieOnly" | "movieAndCollection" | "none"
  >("movieAndCollection");
  const [searchOnAdd, setSearchOnAdd] = useState(false);

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setDownloadProfileIds(movieProfiles.map((p) => p.id));
      setMinimumAvailability("released");
      setMonitorOption("movieAndCollection");
      setSearchOnAdd(false);
    }
  }, [open, movieProfiles]);

  const toggleProfile = (id: number) => {
    setDownloadProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleAdd = () => {
    if (!collection) {
      return;
    }
    if (monitorOption !== "none" && downloadProfileIds.length === 0) {
      return;
    }

    addMissing.mutate(
      {
        collectionId: collection.id,
        downloadProfileIds,
        minimumAvailability: minimumAvailability as
          | "announced"
          | "inCinemas"
          | "released",
        monitorOption,
        searchOnAdd,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const missingCount = collection?.missingMovies ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Missing Movies</DialogTitle>
          {collection && (
            <p className="text-sm text-muted-foreground">
              Add {missingCount} missing movie{missingCount === 1 ? "" : "s"} to{" "}
              {collection.title}
            </p>
          )}
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <ProfileCheckboxGroup
              profiles={movieProfiles}
              selectedIds={downloadProfileIds}
              onToggle={toggleProfile}
            />

            <div className="space-y-2">
              <Label>Monitor</Label>
              <Select
                value={monitorOption}
                onValueChange={(v) =>
                  setMonitorOption(
                    v as "movieOnly" | "movieAndCollection" | "none",
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movieOnly">Movie Only</SelectItem>
                  <SelectItem value="movieAndCollection">
                    Movie &amp; Collection
                  </SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                &ldquo;Movie &amp; Collection&rdquo; will automatically add
                future movies added to this collection on TMDB.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Minimum Availability</Label>
              <Select
                value={minimumAvailability}
                onValueChange={setMinimumAvailability}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="announced">Announced</SelectItem>
                  <SelectItem value="inCinemas">In Cinemas</SelectItem>
                  <SelectItem value="released">Released</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="bulk-search-on-add"
                checked={searchOnAdd}
                onCheckedChange={(checked) => setSearchOnAdd(checked === true)}
              />
              <Label htmlFor="bulk-search-on-add">
                Start search for missing movies
              </Label>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={
              (monitorOption !== "none" && downloadProfileIds.length === 0) ||
              addMissing.isPending ||
              movieProfiles.length === 0
            }
          >
            {addMissing.isPending
              ? "Adding..."
              : `Add ${missingCount} Movie${missingCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
