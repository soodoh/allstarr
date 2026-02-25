import { Pencil, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";

type Indexer = {
  id: number;
  name: string;
  host: string;
  port: number;
  priority: number;
  enabled: boolean;
};

type IndexerListProps = {
  indexers: Indexer[];
  onEdit: (indexer: Indexer) => void;
  onDelete: (id: number) => void;
};

export default function IndexerList({
  indexers,
  onEdit,
  onDelete,
}: IndexerListProps): React.JSX.Element {
  if (indexers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No indexers configured. Add one to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Host</TableHead>
          <TableHead className="w-20">Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {indexers.map((indexer) => (
          <TableRow key={indexer.id}>
            <TableCell className="font-medium">{indexer.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {indexer.host}:{indexer.port}
            </TableCell>
            <TableCell>{indexer.priority}</TableCell>
            <TableCell>
              <Badge variant={indexer.enabled ? "default" : "outline"}>
                {indexer.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(indexer)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(indexer.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
