import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import { Switch } from "~/components/ui/switch";

interface QualityItem {
  quality: { id: number; name: string };
  allowed: boolean;
}

interface QualityProfileFormProps {
  initialValues?: {
    name: string;
    cutoff: number;
    items: QualityItem[];
    upgradeAllowed: boolean;
  };
  qualityDefinitions: { id: number; title: string }[];
  onSubmit: (values: {
    name: string;
    cutoff: number;
    items: QualityItem[];
    upgradeAllowed: boolean;
  }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function QualityProfileForm({
  initialValues,
  qualityDefinitions,
  onSubmit,
  onCancel,
  loading,
}: QualityProfileFormProps) {
  const [name, setName] = useState(initialValues?.name || "");
  const [upgradeAllowed, setUpgradeAllowed] = useState(
    initialValues?.upgradeAllowed || false
  );
  const [items, setItems] = useState<QualityItem[]>(
    initialValues?.items ||
      qualityDefinitions.map((def) => ({
        quality: { id: def.id, name: def.title },
        allowed: true,
      }))
  );

  const handleToggleItem = (qualityId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.quality.id === qualityId
          ? { ...item, allowed: !item.allowed }
          : item
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, cutoff: 0, items, upgradeAllowed });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Profile name"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="upgrade-allowed"
          checked={upgradeAllowed}
          onCheckedChange={setUpgradeAllowed}
        />
        <Label htmlFor="upgrade-allowed">Upgrades Allowed</Label>
      </div>

      <div className="space-y-2">
        <Label>Qualities</Label>
        <div className="space-y-2 rounded-md border border-border p-3">
          {items.map((item) => (
            <div
              key={item.quality.id}
              className="flex items-center gap-2"
            >
              <Checkbox
                checked={item.allowed}
                onCheckedChange={() => handleToggleItem(item.quality.id)}
              />
              <span className="text-sm">{item.quality.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
