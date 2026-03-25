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

type AuthorFormProps = {
  initialValues?: {
    downloadProfileIds: number[];
    monitorNewBooks: MonitorNewBooks;
  };
  downloadProfiles: Array<{ id: number; name: string; icon: string }>;
  onSubmit: (values: {
    downloadProfileIds: number[];
    monitorNewBooks: MonitorNewBooks;
  }) => void;
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
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>(
    initialValues?.downloadProfileIds ?? [],
  );
  const [monitorNewBooks, setMonitorNewBooks] = useState<MonitorNewBooks>(
    initialValues?.monitorNewBooks ?? "all",
  );

  const toggleProfile = (id: number) => {
    setSelectedProfileIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((pid) => pid !== id);
      }
      return [...prev, id];
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ downloadProfileIds: selectedProfileIds, monitorNewBooks });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <ProfileCheckboxGroup
        profiles={downloadProfiles}
        selectedIds={selectedProfileIds}
        onToggle={toggleProfile}
      />

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Monitor New Books
        </Label>
        <Select
          value={monitorNewBooks}
          onValueChange={(v) => setMonitorNewBooks(v as MonitorNewBooks)}
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
