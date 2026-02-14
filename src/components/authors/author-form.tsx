import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface AuthorFormProps {
  initialValues?: {
    name: string;
    sortName: string;
    overview?: string;
    status: string;
    monitored: boolean;
    qualityProfileId?: number;
    rootFolderPath?: string;
  };
  qualityProfiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  onSubmit: (values: {
    name: string;
    sortName: string;
    overview?: string;
    status: string;
    monitored: boolean;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
}

export function AuthorForm({
  initialValues,
  qualityProfiles,
  rootFolders,
  onSubmit,
  onCancel,
  loading,
  submitLabel = "Save",
}: AuthorFormProps) {
  const [name, setName] = useState(initialValues?.name || "");
  const [sortName, setSortName] = useState(initialValues?.sortName || "");
  const [overview, setOverview] = useState(initialValues?.overview || "");
  const [status, setStatus] = useState(initialValues?.status || "continuing");
  const [monitored, setMonitored] = useState(
    initialValues?.monitored ?? true
  );
  const [qualityProfileId, setQualityProfileId] = useState<string>(
    initialValues?.qualityProfileId?.toString() || ""
  );
  const [rootFolderPath, setRootFolderPath] = useState(
    initialValues?.rootFolderPath || ""
  );

  const handleNameChange = (value: string) => {
    setName(value);
    if (!initialValues) {
      const parts = value.split(" ");
      if (parts.length > 1) {
        setSortName(`${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(" ")}`);
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
      overview: overview || undefined,
      status,
      monitored,
      qualityProfileId: qualityProfileId
        ? parseInt(qualityProfileId)
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

      <div className="space-y-2">
        <Label htmlFor="overview">Overview</Label>
        <Textarea
          id="overview"
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          placeholder="Author biography..."
          rows={4}
        />
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

      <div className="flex items-center gap-2">
        <Switch
          id="monitored"
          checked={monitored}
          onCheckedChange={setMonitored}
        />
        <Label htmlFor="monitored">Monitored</Label>
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
