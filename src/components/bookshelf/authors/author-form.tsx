import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { Button } from "src/components/ui/button";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";

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
      <ProfileCheckboxGroup
        profiles={downloadProfiles}
        selectedIds={downloadProfileIds}
        onToggle={toggleProfile}
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
