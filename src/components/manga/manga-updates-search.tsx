import { useState, useEffect, useMemo } from "react";
import type { JSX, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BookOpenText, Search, Star } from "lucide-react";
import Markdown from "react-markdown";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
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
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import OptimizedImage from "src/components/shared/optimized-image";
import { mangaUpdatesSearchQuery } from "src/lib/queries/manga-updates";
import { mangaExistenceQuery } from "src/lib/queries/manga";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import { useAddManga } from "src/hooks/mutations/manga";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import type { MangaUpdatesSeriesResult } from "src/server/manga-updates";

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

function extractSlugFromUrl(url: string): string | null {
  // MangaUpdates URLs look like: https://www.mangaupdates.com/series/xxxxx/title-slug
  // We need both the short ID and the title slug
  const match = url.match(/\/series\/(.+)/);
  return match?.[1] ?? null;
}

function stripHtml(html: string | undefined | null): string {
  if (!html) {
    return "";
  }
  return html.replaceAll(/<[^>]*>/g, "");
}

// ── Preview Modal ─────────────────────────────────────────────────────────

type MangaPreviewModalProps = {
  manga: MangaUpdatesSeriesResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addDefaults?: Record<string, unknown> | null;
};

function MangaPreviewModal({
  manga: series,
  open,
  onOpenChange,
  addDefaults,
}: MangaPreviewModalProps): JSX.Element {
  const navigate = useNavigate();
  const addManga = useAddManga();
  const upsertSettings = useUpsertUserSettings();

  const { data: existingManga = null } = useQuery({
    ...mangaExistenceQuery(series.series_id),
    enabled: open && series.series_id > 0,
  });

  const { data: allProfiles } = useQuery({
    ...downloadProfilesListQuery(),
    enabled: open,
  });

  const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
    () => (addDefaults?.downloadProfileIds as number[] | undefined) ?? [],
  );
  const [monitorOption, setMonitorOption] = useState<string>(
    () => (addDefaults?.monitorOption as string | undefined) ?? "all",
  );
  const [searchOnAdd, setSearchOnAdd] = useState(
    () => (addDefaults?.searchOnAdd as boolean | undefined) ?? false,
  );

  const mangaProfiles = useMemo(
    () => (allProfiles ?? []).filter((p) => p.contentType === "manga"),
    [allProfiles],
  );

  const toggleProfile = (id: number) => {
    setDownloadProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const description = series.description ?? "";
  const descriptionPlain = stripHtml(description);
  const genres = series.genres?.map((g) => g.genre) ?? [];

  const handleAdd = () => {
    if (downloadProfileIds.length === 0) {
      return;
    }
    upsertSettings.mutate({
      tableId: "manga",
      addDefaults: {
        downloadProfileIds,
        monitorOption,
        searchOnAdd,
      },
    });
    addManga.mutate({
      mangaUpdatesId: series.series_id,
      title: series.title,
      sortTitle: generateSortTitle(series.title),
      overview: descriptionPlain,
      mangaUpdatesSlug: extractSlugFromUrl(series.url),
      type: series.type?.toLowerCase() ?? "manga",
      year: series.year || null,
      status: "ongoing",
      latestChapter: null,
      posterUrl: series.image?.url?.original ?? "",
      genres,
      downloadProfileIds,
      monitorOption: monitorOption as "all" | "future" | "missing" | "none",
      searchOnAdd,
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
          <DialogTitle className="sr-only">{series.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Add {series.title} to your library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Poster + title row */}
          <div className="flex gap-4">
            <OptimizedImage
              src={series.image?.url?.original ?? null}
              alt={`${series.title} cover`}
              type="manga"
              width={128}
              height={192}
              className="h-48 w-32 shrink-0 rounded"
            />

            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-xl font-semibold leading-tight">
                {series.title}
                {series.year && (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    ({series.year})
                  </span>
                )}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                {series.type && (
                  <Badge variant="secondary">{series.type}</Badge>
                )}
                {series.bayesian_rating > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    {series.bayesian_rating.toFixed(2)}
                  </Badge>
                )}
                {existingManga && <Badge>Already in library</Badge>}
              </div>

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {genres.map((genre) => (
                    <Badge key={genre} variant="outline" className="text-xs">
                      {genre}
                    </Badge>
                  ))}
                </div>
              )}

              {description && (
                <div className="text-sm text-muted-foreground leading-relaxed prose prose-sm prose-invert max-w-none">
                  <Markdown>{description}</Markdown>
                </div>
              )}
            </div>
          </div>

          {/* Add form */}
          {!existingManga && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <ProfileCheckboxGroup
                profiles={mangaProfiles}
                selectedIds={downloadProfileIds}
                onToggle={toggleProfile}
              />

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

              <div className="flex items-center justify-between">
                <Label htmlFor="search-on-add">Search on Add</Label>
                <Switch
                  id="search-on-add"
                  checked={searchOnAdd}
                  onCheckedChange={setSearchOnAdd}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleAdd}
                disabled={downloadProfileIds.length === 0}
              >
                Add Manga
              </Button>
            </div>
          )}

          {existingManga && (
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                navigate({
                  to: "/manga/series/$mangaId",
                  params: { mangaId: String(existingManga.id) },
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
  manga: series,
  onClick,
}: {
  manga: MangaUpdatesSeriesResult;
  onClick: (manga: MangaUpdatesSeriesResult) => void;
}): JSX.Element {
  const description = stripHtml(series.description);

  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={() => onClick(series)}
    >
      <Card className="py-0 overflow-hidden hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <OptimizedImage
              src={series.image?.url?.thumb ?? null}
              alt={`${series.title} cover`}
              type="manga"
              width={64}
              height={96}
              className="h-24 w-16 shrink-0 rounded"
            />

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {series.year && <Badge variant="outline">{series.year}</Badge>}
                {series.type && (
                  <Badge variant="secondary">{series.type}</Badge>
                )}
                {series.bayesian_rating > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    {series.bayesian_rating.toFixed(2)}
                  </Badge>
                )}
              </div>

              <h3 className="font-semibold leading-tight">{series.title}</h3>

              {description && (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {description}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

// ── Main Search Component ─────────────────────────────────────────────────

export default function MangaUpdatesSearch(): JSX.Element {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [previewManga, setPreviewManga] = useState<
    MangaUpdatesSeriesResult | undefined
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
  } = useQuery(mangaUpdatesSearchQuery(debouncedQuery));

  const results = searchData?.results ?? [];

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
  } else if (!debouncedQuery || debouncedQuery.length < 2) {
    searchResultsContent = (
      <EmptyState
        icon={Search}
        title="Search for manga"
        description="Enter a manga title above to search MangaUpdates."
      />
    );
  } else if (isLoading) {
    searchResultsContent = (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">
            Searching MangaUpdates...
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
          {results.map((series) => (
            <MangaResultCard
              key={series.series_id}
              manga={series}
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
