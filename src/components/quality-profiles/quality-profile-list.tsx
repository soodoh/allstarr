import { Pencil, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";

interface QualityProfile {
  id: number;
  name: string;
  cutoff: number;
  items: { quality: { id: number; name: string }; allowed: boolean }[] | null;
  upgradeAllowed: boolean;
}

interface QualityProfileListProps {
  profiles: QualityProfile[];
  onEdit: (profile: QualityProfile) => void;
  onDelete: (id: number) => void;
}

export function QualityProfileList({
  profiles,
  onEdit,
  onDelete,
}: QualityProfileListProps) {
  if (profiles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No quality profiles found. Create one to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Qualities</TableHead>
          <TableHead>Upgrades</TableHead>
          <TableHead className="w-24">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map((profile) => {
          const allowedItems = (profile.items || []).filter((i) => i.allowed);
          return (
            <TableRow key={profile.id}>
              <TableCell className="font-medium">{profile.name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {allowedItems.map((item) => (
                    <Badge key={item.quality.id} variant="secondary">
                      {item.quality.name}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {profile.upgradeAllowed ? "Yes" : "No"}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(profile)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(profile.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
