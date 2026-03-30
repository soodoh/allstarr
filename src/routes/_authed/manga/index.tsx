import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  BookOpenText,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import useViewMode from "src/hooks/use-view-mode";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import EmptyState from "src/components/shared/empty-state";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
import MangaCard from "src/components/manga/manga-card";
import MangaTable from "src/components/manga/manga-table";
import MangaBulkBar from "src/components/manga/manga-bulk-bar";
import Skeleton from "src/components/ui/skeleton";
import { mangaListQuery } from "src/lib/queries/manga";
import { userSettingsQuery } from "src/lib/queries/user-settings";

export const Route = createFileRoute("/_authed/manga/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(mangaListQuery()),
      context.queryClient.ensureQueryData(userSettingsQuery("manga")),
    ]);
  },
  component: MangaPage,
  pendingComponent: MangaPageSkeleton,
});

function MangaEmptyState() {
  return (
    <div>
      <PageHeader
        title="Manga"
        actions={
          <Button asChild>
            <Link to="/manga/add">
              <Plus className="mr-2 h-4 w-4" />
              Add Manga
            </Link>
          </Button>
        }
      />
      <EmptyState
        icon={BookOpenText}
        title="No manga yet"
        description="Add your first manga to start building your collection."
        action={
          <Button asChild>
            <Link to="/manga/add">
              <Plus className="mr-2 h-4 w-4" />
              Add Manga
            </Link>
          </Button>
        }
      />
    </div>
  );
}

function useMassEdit(filteredIds: number[]) {
  const [massEditMode, setMassEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const exit = useCallback(() => {
    setMassEditMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback(() => {
    if (massEditMode) {
      exit();
    } else {
      setMassEditMode(true);
    }
  }, [massEditMode, exit]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredIds.length) {
        return new Set();
      }
      return new Set(filteredIds);
    });
  }, [filteredIds]);

  return { massEditMode, selectedIds, exit, toggle, toggleSelect, toggleAll };
}

type MangaPageActionsProps = {
  view: "table" | "grid";
  setView: (mode: "table" | "grid") => void;
  massEditMode: boolean;
  onToggleMassEdit: () => void;
};

function MangaPageActions({
  view,
  setView,
  massEditMode,
  onToggleMassEdit,
}: MangaPageActionsProps) {
  return (
    <div className="flex gap-2">
      {!massEditMode && (
        <div className="flex border border-border rounded-md">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setView("table")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      )}
      <Button
        variant={massEditMode ? "destructive" : "outline"}
        onClick={onToggleMassEdit}
      >
        {massEditMode ? (
          <>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </>
        ) : (
          <>
            <Pencil className="mr-2 h-4 w-4" />
            Mass Editor
          </>
        )}
      </Button>
      {!massEditMode && (
        <Button asChild>
          <Link to="/manga/add">
            <Plus className="mr-2 h-4 w-4" />
            Add Manga
          </Link>
        </Button>
      )}
    </div>
  );
}

function MangaPage() {
  const [view, setView] = useViewMode("manga");
  const [search, setSearch] = useState("");

  const { data: mangaList } = useSuspenseQuery(mangaListQuery());

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return mangaList;
    }
    const q = search.toLowerCase();
    return mangaList.filter((m) => m.title.toLowerCase().includes(q));
  }, [mangaList, search]);

  const filteredIds = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const {
    massEditMode,
    selectedIds,
    exit: exitMassEdit,
    toggle: toggleMassEdit,
    toggleSelect,
    toggleAll,
  } = useMassEdit(filteredIds);

  if (mangaList.length === 0 && !search) {
    return <MangaEmptyState />;
  }

  const description = search
    ? `${filtered.length} matching series`
    : `${mangaList.length} series`;

  return (
    <div className={massEditMode ? "pb-20" : ""}>
      <PageHeader
        title="Manga"
        description={description}
        actions={
          <MangaPageActions
            view={view}
            setView={setView}
            massEditMode={massEditMode}
            onToggleMassEdit={toggleMassEdit}
          />
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {view === "table" && <ColumnSettingsPopover tableId="manga" />}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={Search}
          title="No results"
          description={`No manga match "${search}".`}
        />
      )}

      {filtered.length > 0 && (massEditMode || view === "table") && (
        <MangaTable
          mangaList={filtered}
          selectable={massEditMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
        />
      )}

      {filtered.length > 0 && !massEditMode && view === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filtered.map((m) => (
            <MangaCard key={m.id} manga={m} />
          ))}
        </div>
      )}

      {massEditMode && (
        <MangaBulkBar selectedIds={selectedIds} onDone={exitMassEdit} />
      )}
    </div>
  );
}

function MangaPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- Skeleton placeholders have no meaningful key
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="w-full aspect-[2/3] rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
