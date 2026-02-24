import {
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import PageHeader from "~/components/shared/page-header";
import AuthorForm from "~/components/authors/author-form";
import { qualityProfilesListQuery, rootFoldersListQuery } from "~/lib/queries";
import { useCreateAuthor } from "~/hooks/mutations";

export const Route = createFileRoute("/_authed/add/author")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(qualityProfilesListQuery()),
      context.queryClient.ensureQueryData(rootFoldersListQuery()),
    ]);
  },
  component: AddAuthorPage,
});

function AddAuthorPage() {
  const { data: qualityProfiles } = useSuspenseQuery(qualityProfilesListQuery());
  const { data: rootFolders } = useSuspenseQuery(rootFoldersListQuery());
  const navigate = useNavigate();
  const createAuthor = useCreateAuthor();

  const handleSubmit = (values: {
    name: string;
    sortName: string;
    overview?: string;
    status: string;
    monitored: boolean;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => {
    createAuthor.mutate(values, {
      onSuccess: (author) => {
        navigate({
          to: "/authors/$authorId",
          params: { authorId: String(author.id) },
        });
      },
    });
  };

  return (
    <div>
      <PageHeader title="Add Author" />
      <AuthorForm
        qualityProfiles={qualityProfiles}
        rootFolders={rootFolders}
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: "/authors" })}
        loading={createAuthor.isPending}
        submitLabel="Add Author"
      />
    </div>
  );
}
