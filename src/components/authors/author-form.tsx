import { useState } from "react";
import { Button } from "~/components/ui/button";
import Input from "~/components/ui/input";
import Label from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

type AuthorFormProps = {
  initialValues?: {
    name: string;
    sortName: string;
    status: string;
    qualityProfileId?: number;
    rootFolderPath?: string;
  };
  qualityProfiles: Array<{ id: number; name: string }>;
  rootFolders: Array<{ id: number; path: string }>;
  onSubmit: (values: {
    name: string;
    sortName: string;
    status: string;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
};

export default function AuthorForm({
  initialValues,
  qualityProfiles,
  rootFolders,
  onSubmit,
  onCancel,
  loading,
  submitLabel = "Save",
}: AuthorFormProps): React.JSX.Element {
  const [name, setName] = useState(initialValues?.name || "");
  const [sortName, setSortName] = useState(initialValues?.sortName || "");
  const [status, setStatus] = useState(initialValues?.status || "continuing");
  const [qualityProfileId, setQualityProfileId] = useState<string>(
    initialValues?.qualityProfileId?.toString() || "",
  );
  const [rootFolderPath, setRootFolderPath] = useState(
    initialValues?.rootFolderPath || "",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      sortName,
      status,
      qualityProfileId: qualityProfileId
        ? Number.parseInt(qualityProfileId, 10)
        : undefined,
      rootFolderPath: rootFolderPath || undefined,
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
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
          <Label>Quality Profile</Label>
          <Select value={qualityProfileId} onValueChange={setQualityProfileId}>
            <SelectTrigger>
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {qualityProfiles.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Root Folder</Label>
        <Select value={rootFolderPath} onValueChange={setRootFolderPath}>
          <SelectTrigger>
            <SelectValue placeholder="Select root folder" />
          </SelectTrigger>
          <SelectContent>
            {rootFolders.map((f) => (
              <SelectItem key={f.id} value={f.path}>
                {f.path}
              </SelectItem>
            ))}
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
