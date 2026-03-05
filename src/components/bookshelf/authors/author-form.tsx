import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { Button } from "src/components/ui/button";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import { getProfileIcon } from "src/lib/profile-icons";

type AuthorFormProps = {
  initialValues?: {
    downloadProfileIds: number[];
  };
  downloadProfiles: Array<{ id: number; name: string; icon: string }>;
  onSubmit: (values: { downloadProfileIds: number[] }) => void;
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
  const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
    initialValues?.downloadProfileIds ?? [],
  );

  const toggleProfile = (id: number) => {
    setDownloadProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ downloadProfileIds });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label>Download Profiles</Label>
        {downloadProfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No download profiles available. Create one in Settings.
          </p>
        ) : (
          <div className="space-y-2">
            {downloadProfiles.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={downloadProfileIds.includes(p.id)}
                  onCheckedChange={() => toggleProfile(p.id)}
                />
                {(() => {
                  const Icon = getProfileIcon(p.icon);
                  return <Icon className="h-4 w-4 text-muted-foreground" />;
                })()}
                <span className="text-sm">{p.name}</span>
              </label>
            ))}
          </div>
        )}
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
