import { useMemo, useState } from "react";
import type { JSX } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import { BookDetailSkeleton } from "src/components/shared/loading-skeleton";
import BookCover from "src/components/bookshelf/books/book-cover";
import AdditionalAuthors from "src/components/bookshelf/books/additional-authors";

import EditionsTab from "src/components/bookshelf/books/editions-tab";
import SearchReleasesTab from "src/components/bookshelf/books/search-releases-tab";

import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "src/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";

import {
  bookDetailQuery,
  hasEnabledIndexersQuery,
  qualityProfilesListQuery,
} from "src/lib/queries";
import {
  useRefreshBookMetadata,
  useToggleBookProfile,
} from "src/hooks/mutations";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import MetadataWarning from "src/components/shared/metadata-warning";
import ReassignFilesDialog from "src/components/bookshelf/books/reassign-files-dialog";
import NotFound from "src/components/NotFound";

export const Route = createFileRoute("/_authed/bookshelf/books/$bookId")({
  loader: async ({ params, context }) => {
    const id = Number(params.bookId);
    if (!Number.isFinite(id) || id <= 0) {
      throw notFound();
    }
    await Promise.all([
      context.queryClient.ensureQueryData(bookDetailQuery(id)),
      context.queryClient.ensureQueryData(qualityProfilesListQuery()),
    ]);
  },
  component: BookDetailPage,
  notFoundComponent: NotFound,
  pendingComponent: () => <BookDetailSkeleton />,
});

// oxlint-disable-next-line complexity -- Book detail page with multiple sections and tabs
function BookDetailPage(): JSX.Element {
  const { bookId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();

  const { data: book } = useSuspenseQuery(bookDetailQuery(Number(bookId)));
  const { data: qualityProfiles } = useSuspenseQuery(
    qualityProfilesListQuery(),
  );

  const [activeTab, setActiveTab] = useState("editions");
  const [reassignOpen, setReassignOpen] = useState(false);

  const refreshMetadata = useRefreshBookMetadata();
  const toggleBookProfile = useToggleBookProfile();

  const authorQualityProfiles = useMemo(() => {
    if (!book || !qualityProfiles) {
      return [];
    }
    const profileIdSet = new Set(book.authorQualityProfileIds);
    return qualityProfiles.filter((p) => profileIdSet.has(p.id));
  }, [book, qualityProfiles]);

  const { data: hasIndexers } = useQuery({
    ...hasEnabledIndexersQuery(),
    enabled: activeTab === "search",
  });

  const editionsList = useMemo(() => book?.editions ?? [], [book?.editions]);
  if (!book) {
    return <NotFound />;
  }

  const coverImages = book.images;
  const hardcoverUrl = book.slug
    ? `https://hardcover.app/books/${book.slug}`
    : null;

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(book.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        to="/bookshelf/books"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Books
      </Link>

      {/* Page header */}
      <div className="flex items-start gap-3">
        {(() => {
          if (book.metadataSourceMissingSince) {
            return (
              <MetadataWarning
                type="book"
                missingSince={book.metadataSourceMissingSince}
                itemId={book.id}
                itemTitle={book.title}
                fileCount={book.fileCount}
                size="lg"
                onDeleted={() => navigate({ to: "/bookshelf/books" })}
                onReassignFiles={() => setReassignOpen(true)}
              />
            );
          }
          if (book.missingEditionsCount > 0) {
            return (
              <MetadataWarning
                type="book-editions"
                missingSince={new Date()}
                missingEditionsCount={book.missingEditionsCount}
                itemId={book.id}
                itemTitle={book.title}
                size="lg"
              />
            );
          }
          return (
            <ProfileToggleIcons
              profiles={authorQualityProfiles}
              activeProfileIds={book.qualityProfileIds}
              onToggle={(profileId) =>
                toggleBookProfile.mutate(
                  { bookId: book.id, qualityProfileId: profileId },
                  { onSuccess: () => router.invalidate() },
                )
              }
              isPending={toggleBookProfile.isPending}
              size="lg"
              direction="vertical"
            />
          );
        })()}
        <div className="flex-1 min-w-0">
          <PageHeader
            title={book.title}
            description={<AdditionalAuthors bookAuthors={book.bookAuthors} />}
            actions={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshMetadata}
                  disabled={refreshMetadata.isPending}
                >
                  {refreshMetadata.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Update Metadata
                </Button>
                {hardcoverUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={hardcoverUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Hardcover
                    </a>
                  </Button>
                )}
              </div>
            }
          />
        </div>
      </div>

      {/* Cover + Details + Description */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <BookCover
          title={book.title}
          images={coverImages}
          className="w-full xl:w-44 shrink-0"
        />

        <Card className="w-full xl:w-72 xl:shrink-0">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Author</dt>
                <dd className="text-right">
                  <AdditionalAuthors
                    bookAuthors={book.bookAuthors}
                    expandable
                  />
                </dd>
              </div>
              {book.releaseDate && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Release Date</dt>
                  <dd>{book.releaseDate}</dd>
                </div>
              )}
              {book.series && book.series.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Series</dt>
                  <dd>
                    {book.series
                      .map((s) =>
                        s.position ? `${s.title} #${s.position}` : s.title,
                      )
                      .join(", ")}
                  </dd>
                </div>
              )}
              {book.rating !== null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd>
                    {book.rating.toFixed(1)}/5
                    {book.ratingsCount !== null && book.ratingsCount > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({book.ratingsCount.toLocaleString()})
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {book.usersCount !== null && book.usersCount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Readers</dt>
                  <dd>{book.usersCount.toLocaleString()}</dd>
                </div>
              )}
              {book.languages && book.languages.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Languages</dt>
                  <dd>
                    <Popover>
                      <PopoverTrigger className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                        {book.languages.length === 1
                          ? book.languages[0].language
                          : `${book.languages[0].language} and ${book.languages.length - 1} other${book.languages.length - 1 === 1 ? "" : "s"}`}
                        {book.languages.length > 1 && (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </PopoverTrigger>
                      {book.languages.length > 1 && (
                        <PopoverContent align="end" className="w-48 p-0">
                          <ul className="max-h-64 overflow-y-auto py-1">
                            {book.languages.map((l) => (
                              <li
                                key={l.languageCode}
                                className="px-3 py-1.5 text-sm"
                              >
                                {l.language}
                              </li>
                            ))}
                          </ul>
                        </PopoverContent>
                      )}
                    </Popover>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="w-full xl:flex-1">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            {book.description ? (
              <p className="text-sm leading-relaxed">{book.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col"
          >
            <TabsList className="m-4 mb-0">
              <TabsTrigger value="editions">Editions</TabsTrigger>
              <TabsTrigger value="search">Search Releases</TabsTrigger>
            </TabsList>

            <div className="p-4">
              <EditionsTab
                editions={editionsList}
                authorQualityProfiles={authorQualityProfiles}
              />
              <SearchReleasesTab
                book={book}
                enabled={activeTab === "search"}
                hasIndexers={hasIndexers}
              />
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Reassign files dialog */}
      <ReassignFilesDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        fromBookId={book.id}
        fromBookTitle={book.title}
        fileCount={book.fileCount}
        onSuccess={() => router.invalidate()}
      />
    </div>
  );
}
