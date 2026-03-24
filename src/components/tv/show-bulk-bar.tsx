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
import { useUpdateShow } from "src/hooks/mutations/shows";

type Profile = { id: number; name: string };

type ShowBulkBarProps = {
  selectedIds: Set<number>;
  profiles: Profile[];
  onDone: () => void;
};

export default function ShowBulkBar({
  selectedIds,
  profiles,
  onDone,
}: ShowBulkBarProps): JSX.Element {
  const [profileId, setProfileId] = useState("");
  const [monitored, setMonitored] = useState("");
  const [seriesType, setSeriesType] = useState("");
  const [applying, setApplying] = useState(false);

  const updateShow = useUpdateShow();

  const handleApply = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    setApplying(true);

    const ids = [...selectedIds];
    const promises = ids.map((id) => {
      const payload: {
        id: number;
        monitored?: boolean;
        seriesType?: "standard" | "daily" | "anime";
        downloadProfileId?: number;
      } = { id };
      if (monitored === "true") {
        payload.monitored = true;
      }
      if (monitored === "false") {
        payload.monitored = false;
      }
      if (seriesType) {
        payload.seriesType = seriesType as "standard" | "daily" | "anime";
      }
      if (profileId) {
        payload.downloadProfileId = Number(profileId);
      }
      return updateShow.mutateAsync(payload);
    });

    try {
      await Promise.all(promises);
      toast.success(`Updated ${ids.length} show${ids.length > 1 ? "s" : ""}`);
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

        <Select value={monitored} onValueChange={setMonitored}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Monitored" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Monitored</SelectItem>
            <SelectItem value="false">Unmonitored</SelectItem>
          </SelectContent>
        </Select>

        <Select value={seriesType} onValueChange={setSeriesType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Series Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="anime">Anime</SelectItem>
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
