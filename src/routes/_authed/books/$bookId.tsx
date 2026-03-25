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
import { ArrowLeft, ChevronDown } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import ActionButtonGroup from "src/components/shared/action-button-group";
import { BookDetailSkeleton } from "src/components/shared/loading-skeleton";
import BookCover from "src/components/bookshelf/books/book-cover";
import AdditionalAuthors from "src/components/bookshelf/books/additional-authors";

import EditionsTab from "src/components/bookshelf/books/editions-tab";
import BookFilesTab from "src/components/bookshelf/books/book-files-tab";
import SearchReleasesTab from "src/components/bookshelf/books/search-releases-tab";
import BookEditDialog from "src/components/bookshelf/books/book-edit-dialog";
import BookDeleteDialog from "src/components/bookshelf/books/book-delete-dialog";

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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "src/components/ui/tabs";

import {
  bookDetailQuery,
  hasEnabledIndexersQuery,
  downloadProfilesListQuery,
} from "src/lib/queries";
import {
  useRefreshBookMetadata,
  useMonitorBookProfile,
  useUnmonitorBookProfile,
} from "src/hooks/mutations";
import UnmonitorDialog from "src/components/bookshelf/books/unmonitor-dialog";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import MetadataWarning from "src/components/shared/metadata-warning";
import ReassignFilesDialog from "src/components/bookshelf/books/reassign-files-dialog";
import NotFound from "src/components/NotFound";
import BookHistoryTab from "src/components/bookshelf/books/book-history-tab";

export const Route = createFileRoute("/_authed/books/$bookId")({
  loader: async ({ params, context }) => {
    const id = Number(params.bookId);
    if (!Number.isFinite(id) || id <= 0) {
      throw notFound();
    }
    await Promise.all([
      context.queryClient.ensureQueryData(bookDetailQuery(id)),
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
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
  const { data: downloadProfiles } = useSuspenseQuery(
    downloadProfilesListQuery(),
  );

  const [activeTab, setActiveTab] = useState("editions");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
    null,
  );

  const refreshMetadata = useRefreshBookMetadata();
  const monitorBookProfile = useMonitorBookProfile();
  const unmonitorBookProfile = useUnmonitorBookProfile();

  const authorDownloadProfiles = useMemo(() => {
    if (!book || !downloadProfiles) {
      return [];
    }
    const profileIdSet = new Set(book.authorDownloadProfileIds);
    return downloadProfiles
      .filter((p) => profileIdSet.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
        contentType: p.contentType,
        language: p.language,
      }));
  }, [book, downloadProfiles]);

  const { data: hasIndexers } = useQuery({
    ...hasEnabledIndexersQuery(),
    enabled: activeTab === "search",
  });

  if (!book) {
    return <NotFound />;
  }

  const coverImages = book.images;
  const hardcoverUrl = book.slug
    ? `https://hardcover.app/books/${book.slug}`
    : null;

  const primaryAuthor = book.bookAuthors[0];

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(book.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Back link + Action buttons */}
      <div className="flex items-center justify-between">
        <Link
          to={primaryAuthor?.authorId ? "/authors/$authorId" : "/books"}
          params={
            primaryAuthor?.authorId
              ? { authorId: String(primaryAuthor.authorId) }
              : undefined
          }
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {primaryAuthor?.authorName ?? "Back to Books"}
        </Link>
        <ActionButtonGroup
          onRefreshMetadata={handleRefreshMetadata}
          isRefreshing={refreshMetadata.isPending}
          onEdit={() => setEditOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          externalUrl={hardcoverUrl}
          externalLabel="Open in Hardcover"
        />
      </div>

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
                onDeleted={() => navigate({ to: "/books" })}
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
              profiles={authorDownloadProfiles}
              activeProfileIds={book.downloadProfileIds}
              onToggle={(profileId) => {
                if (book.downloadProfileIds.includes(profileId)) {
                  setUnmonitorProfileId(profileId);
                } else {
                  monitorBookProfile.mutate(
                    { bookId: book.id, downloadProfileId: profileId },
                    { onSuccess: () => router.invalidate() },
                  );
                }
              }}
              isPending={
                monitorBookProfile.isPending || unmonitorBookProfile.isPending
              }
              size="lg"
              direction="vertical"
            />
          );
        })()}
        <div className="flex-1 min-w-0">
          <PageHeader
            title={book.title}
            description={<AdditionalAuthors bookAuthors={book.bookAuthors} />}
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
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="search">Search Releases</TabsTrigger>
            </TabsList>

            <div className="p-4">
              <EditionsTab
                bookId={book.id}
                bookTitle={book.title}
                fileCount={book.fileCount}
                authorDownloadProfiles={authorDownloadProfiles}
                editions={book.editions}
              />
              <BookFilesTab files={book.files} />
              <TabsContent value="history" className="flex-1 min-h-0">
                <BookHistoryTab bookId={book.id} />
              </TabsContent>
              <SearchReleasesTab
                book={book}
                enabled={activeTab === "search"}
                hasIndexers={hasIndexers}
              />
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <BookEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        bookId={book.id}
        bookTitle={book.title}
        autoSwitchEdition={book.autoSwitchEdition === 1}
        onSuccess={() => router.invalidate()}
      />

      {/* Delete dialog */}
      <BookDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        bookId={book.id}
        bookTitle={book.title}
        fileCount={book.fileCount}
        foreignBookId={book.foreignBookId}
        onSuccess={() => {
          if (primaryAuthor?.authorId) {
            navigate({
              to: "/authors/$authorId",
              params: { authorId: String(primaryAuthor.authorId) },
            });
          } else {
            navigate({ to: "/books" });
          }
        }}
      />

      {/* Unmonitor profile dialog (triggered from header toggle) */}
      {unmonitorProfileId !== null && (
        <UnmonitorDialog
          open={unmonitorProfileId !== null}
          onOpenChange={(open) => !open && setUnmonitorProfileId(null)}
          profileName={
            authorDownloadProfiles.find((p) => p.id === unmonitorProfileId)
              ?.name ?? ""
          }
          itemTitle={book.title}
          itemType="book"
          fileCount={book.fileCount}
          onConfirm={(deleteFiles) => {
            unmonitorBookProfile.mutate(
              {
                bookId: book.id,
                downloadProfileId: unmonitorProfileId,
                deleteFiles,
              },
              {
                onSuccess: () => {
                  setUnmonitorProfileId(null);
                  router.invalidate();
                },
              },
            );
          }}
          isPending={unmonitorBookProfile.isPending}
        />
      )}

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
