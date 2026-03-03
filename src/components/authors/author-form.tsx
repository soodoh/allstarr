import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { Button } from "src/components/ui/button";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import { getProfileIcon } from "src/lib/profile-icons";

type AuthorFormProps = {
  initialValues?: {
    qualityProfileIds: number[];
  };
  qualityProfiles: Array<{ id: number; name: string; icon: string }>;
  onSubmit: (values: { qualityProfileIds: number[] }) => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
};

export default function AuthorForm({
  initialValues,
  qualityProfiles,
  onSubmit,
  onCancel,
  loading,
  submitLabel = "Save",
}: AuthorFormProps): JSX.Element {
  const [qualityProfileIds, setQualityProfileIds] = useState<number[]>(
    initialValues?.qualityProfileIds ?? [],
  );

  const toggleProfile = (id: number) => {
    setQualityProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ qualityProfileIds });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label>Quality Profiles</Label>
        {qualityProfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No quality profiles available. Create one in Settings.
          </p>
        ) : (
          <div className="space-y-2">
            {qualityProfiles.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={qualityProfileIds.includes(p.id)}
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
