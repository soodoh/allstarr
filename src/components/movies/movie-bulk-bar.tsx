import { useState } from "react";
import type { JSX } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { useUpdateMovie } from "src/hooks/mutations/movies";

type Profile = { id: number; name: string };

type MovieBulkBarProps = {
  selectedIds: Set<number>;
  profiles: Profile[];
  onDone: () => void;
};

export default function MovieBulkBar({
  selectedIds,
  profiles,
  onDone,
}: MovieBulkBarProps): JSX.Element {
  const [profileId, setProfileId] = useState("");
  const [minAvailability, setMinAvailability] = useState("");
  const [applying, setApplying] = useState(false);

  const updateMovie = useUpdateMovie();

  const handleApply = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    setApplying(true);

    const ids = [...selectedIds];
    const promises = ids.map((id) => {
      const payload: {
        id: number;
        minimumAvailability?: "announced" | "inCinemas" | "released";
        downloadProfileIds?: number[];
      } = { id };
      if (minAvailability) {
        payload.minimumAvailability = minAvailability as
          | "announced"
          | "inCinemas"
          | "released";
      }
      if (profileId) {
        payload.downloadProfileIds = [Number(profileId)];
      }
      return updateMovie.mutateAsync(payload);
    });

    try {
      await Promise.all(promises);
      toast.success(`Updated ${ids.length} movie${ids.length > 1 ? "s" : ""}`);
      onDone();
    } catch {
      toast.error("Some updates failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-zinc-950 px-6 py-3">
      <div className="flex items-center gap-4 max-w-7xl mx-auto">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {selectedIds.size} selected
        </span>

        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Profile" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={minAvailability} onValueChange={setMinAvailability}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Min. Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="announced">Announced</SelectItem>
            <SelectItem value="inCinemas">In Cinemas</SelectItem>
            <SelectItem value="released">Released</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button
            disabled={selectedIds.size === 0 || applying}
            onClick={handleApply}
          >
            {applying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              "Apply"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
