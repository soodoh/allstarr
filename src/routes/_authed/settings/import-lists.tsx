import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import EmptyState from "src/components/shared/empty-state";
import { ListPlus } from "lucide-react";
import { toast } from "sonner";
import {
  getImportListExclusionsFn,
  removeImportListExclusionFn,
} from "src/server/import-list-exclusions";

export const Route = createFileRoute("/_authed/settings/import-lists")({
  component: ImportListsPage,
});

function ImportListsPage() {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["import-list-exclusions"],
    queryFn: () => getImportListExclusionsFn({ data: { page: 1, limit: 50 } }),
  });

  const items = data?.items ?? [];

  const removeMutation = useMutation({
    mutationFn: (id: number) => removeImportListExclusionFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-list-exclusions"] });
      toast.success("Exclusion removed");
      setConfirmId(null);
    },
    onError: () => {
      toast.error("Failed to remove exclusion");
    },
  });

  return (
    <div>
      <PageHeader
        title="Import Lists"
        description="Manage import lists and exclusions"
      />

      <h2 className="text-lg font-semibold mb-4">Import List Exclusions</h2>

      {items.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="No exclusions"
          description="Books excluded from import lists will appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Date Excluded</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.authorName}</TableCell>
                <TableCell>
                  {new Date(item.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmId(item.id)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmId(null);
          }
        }}
        title="Remove Exclusion"
        description="Are you sure you want to remove this exclusion? The book may be imported again."
        onConfirm={() => {
          if (confirmId !== null) {
            removeMutation.mutate(confirmId);
          }
        }}
        loading={removeMutation.isPending}
      />
    </div>
  );
}
