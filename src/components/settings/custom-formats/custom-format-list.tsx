import { useMemo, useState } from "react";
import type { JSX } from "react";
import { Copy, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";
import SortableTableHead from "src/components/shared/sortable-table-head";
import { useTableState } from "src/hooks/use-table-state";

type CustomFormat = {
  id: number;
  name: string;
  category: string;
  defaultScore: number;
  contentTypes: string[];
  origin: string | null;
  description: string | null;
};

type CustomFormatListProps = {
  customFormats: CustomFormat[];
  onEdit: (cf: CustomFormat) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  movie: "border-blue-500 bg-blue-500/20 text-blue-400",
  tv: "border-purple-500 bg-purple-500/20 text-purple-400",
  ebook: "border-green-500 bg-green-500/20 text-green-400",
  audiobook: "border-amber-500 bg-amber-500/20 text-amber-400",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  movie: "Movie",
  tv: "TV",
  ebook: "Ebook",
  audiobook: "Audiobook",
};

const COMPARATORS: Partial<
  Record<string, (a: CustomFormat, b: CustomFormat) => number>
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  category: (a, b) => a.category.localeCompare(b.category),
  defaultScore: (a, b) => a.defaultScore - b.defaultScore,
  origin: (a, b) => (a.origin ?? "").localeCompare(b.origin ?? ""),
};

function originBadge(origin: string | null): JSX.Element {
  if (origin === "builtin") {
    return (
      <Badge
        variant="secondary"
        className="border-blue-500 bg-blue-500/20 text-blue-400"
      >
        Built-in
      </Badge>
    );
  }
  if (origin === "imported") {
    return (
      <Badge
        variant="secondary"
        className="border-purple-500 bg-purple-500/20 text-purple-400"
      >
        Imported
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      Custom
    </Badge>
  );
}

export default function CustomFormatList({
  customFormats,
  onEdit,
  onDuplicate,
  onDelete,
}: CustomFormatListProps): JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<CustomFormat | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) {
      return customFormats;
    }
    const q = search.toLowerCase();
    return customFormats.filter((cf) => cf.name.toLowerCase().includes(q));
  }, [customFormats, search]);

  const { paginatedData, sortColumn, sortDirection, handleSort } =
    useTableState({
      data: filtered,
      defaultPageSize: 10_000,
      comparators: COMPARATORS,
    });

  if (customFormats.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No custom formats found. Create one to get started.
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search custom formats..."
          className="pl-8"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              column="name"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Name
            </SortableTableHead>
            <SortableTableHead
              column="category"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Category
            </SortableTableHead>
            <TableHead>Content Types</TableHead>
            <SortableTableHead
              column="defaultScore"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Default Score
            </SortableTableHead>
            <SortableTableHead
              column="origin"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Origin
            </SortableTableHead>
            <TableHead className="w-28">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map((cf) => (
            <TableRow key={cf.id}>
              <TableCell className="font-medium">{cf.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{cf.category}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {cf.contentTypes.map((ct) => (
                    <Badge
                      key={ct}
                      variant="secondary"
                      className={CONTENT_TYPE_COLORS[ct] ?? ""}
                    >
                      {CONTENT_TYPE_LABELS[ct] ?? ct}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="tabular-nums">{cf.defaultScore}</TableCell>
              <TableCell>{originBadge(cf.origin)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(cf)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDuplicate(cf.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(cf)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {paginatedData.length === 0 && search && (
        <div className="text-center py-8 text-muted-foreground">
          No custom formats matching &ldquo;{search}&rdquo;.
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete Custom Format"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
