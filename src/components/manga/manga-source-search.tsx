import { useState, useEffect } from "react";
import type { JSX, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BookOpenText, Search } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import { Badge } from "src/components/ui/badge";
import { Card, CardContent } from "src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import EmptyState from "src/components/shared/empty-state";
import OptimizedImage from "src/components/shared/optimized-image";
import {
  mangaSourcesSearchQuery,
  mangaExistenceQuery,
} from "src/lib/queries/manga";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import { useAddManga } from "src/hooks/mutations/manga";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import type { MangaSearchResult } from "src/server/manga-search";

// ── Monitor Options ───────────────────────────────────────────────────────

const MONITOR_OPTIONS = [
  { value: "all", label: "All Chapters" },
  { value: "future", label: "Future Chapters" },
  { value: "missing", label: "Missing Chapters" },
  { value: "none", label: "None" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function generateSortTitle(title: string): string {
  return title.replace(/^(The|A|An)\s+/i, "");
}

// ── Preview Modal ─────────────────────────────────────────────────────────

type MangaPreviewModalProps = {
  manga: MangaSearchResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addDefaults?: Record<string, unknown> | null;
};

function MangaPreviewModal({
  manga: result,
  open,
  onOpenChange,
  addDefaults,
}: MangaPreviewModalProps): JSX.Element {
  const navigate = useNavigate();
  const addManga = useAddManga();
  const upsertSettings = useUpsertUserSettings();

  const { data: existingManga = null } = useQuery({
    ...mangaExistenceQuery(result.sourceId, result.url),
    enabled: open && result.url.length > 0,
  });

  const [monitorOption, setMonitorOption] = useState<string>(
    () => (addDefaults?.monitorOption as string | undefined) ?? "all",
  );

  const handleAdd = () => {
    upsertSettings.mutate({
      tableId: "manga",
      addDefaults: {
        monitorOption,
      },
    });
    addManga.mutate({
      sourceId: result.sourceId,
      sourceMangaUrl: result.url,
      title: result.title,
      sortTitle: generateSortTitle(result.title),
      overview: "",
      type: "manga",
      year: null,
      status: "ongoing",
      posterUrl: result.thumbnailUrl ?? "",
      sourceMangaThumbnail: result.thumbnailUrl ?? null,
      genres: [],
      monitorOption: monitorOption as "all" | "future" | "missing" | "none",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{result.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Add {result.title} to your library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Poster + title row */}
          <div className="flex gap-4">
            <OptimizedImage
              src={result.thumbnailUrl ?? null}
              alt={`${result.title} cover`}
              type="manga"
              width={128}
              height={192}
              className="h-48 w-32 shrink-0 rounded"
            />

            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-xl font-semibold leading-tight">
                {result.title}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{result.sourceName}</Badge>
                {existingManga?.exists && <Badge>Already in library</Badge>}
              </div>
            </div>
          </div>

          {/* Add form */}
          {!existingManga?.exists && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label>Monitoring</Label>
                <Select value={monitorOption} onValueChange={setMonitorOption}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONITOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" onClick={handleAdd}>
                Add Manga
              </Button>
            </div>
          )}

          {existingManga?.exists && existingManga.mangaId && (
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                navigate({
                  to: "/manga/series/$mangaId",
                  params: { mangaId: String(existingManga.mangaId) },
                });
              }}
            >
              View Manga
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Result Card ───────────────────────────────────────────────────────────

function MangaResultCard({
  manga: result,
  onClick,
}: {
  manga: MangaSearchResult;
  onClick: (manga: MangaSearchResult) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={() => onClick(result)}
    >
      <Card className="py-0 overflow-hidden hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <OptimizedImage
              src={result.thumbnailUrl ?? null}
              alt={`${result.title} cover`}
              type="manga"
              width={64}
              height={96}
              className="h-24 w-16 shrink-0 rounded"
            />

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{result.sourceName}</Badge>
              </div>

              <h3 className="font-semibold leading-tight">{result.title}</h3>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

// ── Main Search Component ─────────────────────────────────────────────────

export default function MangaSourceSearch(): JSX.Element {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [previewManga, setPreviewManga] = useState<
    MangaSearchResult | undefined
  >(undefined);

  const { data: settings } = useQuery(userSettingsQuery("manga"));

  // Debounce the search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const {
    data: searchData,
    isLoading,
    isError,
    error,
  } = useQuery(mangaSourcesSearchQuery(debouncedQuery));

  const results = searchData?.results ?? [];
  const sourceError = searchData?.error ?? null;

  // Determine content to render
  let searchResultsContent: ReactNode;

  if (isError) {
    const message =
      error instanceof Error ? error.message : "Search request failed.";
    searchResultsContent = (
      <EmptyState
        icon={BookOpenText}
        title="Search failed"
        description={message}
      />
    );
  } else if (sourceError) {
    searchResultsContent = (
      <EmptyState
        icon={BookOpenText}
        title="No sources available"
        description={sourceError}
      />
    );
  } else if (!debouncedQuery || debouncedQuery.length < 2) {
    searchResultsContent = (
      <EmptyState
        icon={Search}
        title="Search for manga"
        description="Enter a manga title above to search across all enabled sources."
      />
    );
  } else if (isLoading) {
    searchResultsContent = (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">
            Searching manga sources...
          </p>
        </CardContent>
      </Card>
    );
  } else if (results.length === 0) {
    searchResultsContent = (
      <EmptyState
        icon={Search}
        title="No results found"
        description={`No manga found for "${debouncedQuery}".`}
      />
    );
  } else {
    searchResultsContent = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Showing {results.length} result{results.length === 1 ? "" : "s"} for
          &ldquo;{debouncedQuery}&rdquo;.
        </p>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {results.map((result) => (
            <MangaResultCard
              key={`${result.sourceId}-${result.url}`}
              manga={result}
              onClick={setPreviewManga}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for manga by title..."
          autoComplete="off"
          aria-label="Search manga"
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="mt-4">{searchResultsContent}</div>

      {previewManga && (
        <MangaPreviewModal
          manga={previewManga}
          open={Boolean(previewManga)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewManga(undefined);
            }
          }}
          addDefaults={settings?.addDefaults}
        />
      )}
    </>
  );
}
