import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

type AuthorFormProps = {
  initialValues?: {
    name: string;
    sortName: string;
    status: string;
    qualityProfileIds: number[];
  };
  qualityProfiles: Array<{ id: number; name: string }>;
  onSubmit: (values: {
    name: string;
    sortName: string;
    status: string;
    qualityProfileIds: number[];
  }) => void;
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
  const [name, setName] = useState(initialValues?.name || "");
  const [sortName, setSortName] = useState(initialValues?.sortName || "");
  const [status, setStatus] = useState(initialValues?.status || "continuing");
  const [qualityProfileIds, setQualityProfileIds] = useState<number[]>(
    initialValues?.qualityProfileIds ?? [],
  );

  const handleNameChange = (value: string) => {
    setName(value);
    if (!initialValues) {
      const parts = value.split(" ");
      if (parts.length > 1) {
        setSortName(`${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`);
      } else {
        setSortName(value);
      }
    }
  };

  const toggleProfile = (id: number) => {
    setQualityProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      sortName,
      status,
      qualityProfileIds,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Author name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sortName">Sort Name</Label>
          <Input
            id="sortName"
            value={sortName}
            onChange={(e) => setSortName(e.target.value)}
            placeholder="Last, First"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-1/2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continuing">Continuing</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
            <SelectItem value="deceased">Deceased</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
