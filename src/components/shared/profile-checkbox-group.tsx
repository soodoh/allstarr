import type { JSX } from "react";
import Checkbox from "src/components/ui/checkbox";
import Label from "src/components/ui/label";
import { getProfileIcon } from "src/lib/profile-icons";

type ProfileCheckboxGroupProps = {
  profiles: Array<{ id: number; name: string; icon: string }>;
  selectedIds: number[];
  onToggle: (id: number) => void;
  label?: string;
};

export default function ProfileCheckboxGroup({
  profiles,
  selectedIds,
  onToggle,
  label = "Download Profiles",
}: ProfileCheckboxGroupProps): JSX.Element {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No download profiles available.
        </p>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => {
            const Icon = getProfileIcon(p.icon);
            return (
              <label
                key={p.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={selectedIds.includes(p.id)}
                  onCheckedChange={() => onToggle(p.id)}
                />
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{p.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
