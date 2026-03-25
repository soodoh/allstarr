import { useMemo, useState } from "react";
import type { FormEvent, JSX } from "react";
import { Button } from "src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import Label from "src/components/ui/label";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";

type MonitorNewBooks = "all" | "none" | "new";

type ProfileEntry = {
  downloadProfileId: number;
  monitorNewBooks: MonitorNewBooks;
};

type AuthorFormProps = {
  initialValues?: {
    downloadProfiles: ProfileEntry[];
  };
  downloadProfiles: Array<{ id: number; name: string; icon: string }>;
  onSubmit: (values: { downloadProfiles: ProfileEntry[] }) => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
};

export default function AuthorForm({
  initialValues,
  downloadProfiles,
  onSubmit,
  onCancel,
  loading,
  submitLabel = "Save",
}: AuthorFormProps): JSX.Element {
  const [profileEntries, setProfileEntries] = useState<ProfileEntry[]>(
    initialValues?.downloadProfiles ?? [],
  );

  const selectedIds = useMemo(
    () => profileEntries.map((e) => e.downloadProfileId),
    [profileEntries],
  );

  const toggleProfile = (id: number) => {
    setProfileEntries((prev) => {
      const exists = prev.find((e) => e.downloadProfileId === id);
      if (exists) {
        return prev.filter((e) => e.downloadProfileId !== id);
      }
      return [...prev, { downloadProfileId: id, monitorNewBooks: "all" }];
    });
  };

  const updateMonitor = (profileId: number, value: MonitorNewBooks) => {
    setProfileEntries((prev) =>
      prev.map((e) =>
        e.downloadProfileId === profileId
          ? { ...e, monitorNewBooks: value }
          : e,
      ),
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ downloadProfiles: profileEntries });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <ProfileCheckboxGroup
        profiles={downloadProfiles}
        selectedIds={selectedIds}
        onToggle={toggleProfile}
        renderExtra={(profileId) => {
          const entry = profileEntries.find(
            (e) => e.downloadProfileId === profileId,
          );
          if (!entry) {
            return null;
          }
          return (
            <div className="ml-6 space-y-1">
              <Label className="text-xs text-muted-foreground">
                Monitor New Books
              </Label>
              <Select
                value={entry.monitorNewBooks}
                onValueChange={(v) =>
                  updateMonitor(profileId, v as MonitorNewBooks)
                }
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Books</SelectItem>
                  <SelectItem value="new">New Books Only</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        }}
      />

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
