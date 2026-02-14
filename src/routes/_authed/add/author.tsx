import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "~/components/shared/page-header";
import { AuthorForm } from "~/components/authors/author-form";
import { createAuthorFn } from "~/server/authors";
import { getQualityProfilesFn } from "~/server/quality-profiles";
import { getRootFoldersFn } from "~/server/root-folders";

export const Route = createFileRoute("/_authed/add/author")({
  loader: async () => {
    const [qualityProfiles, rootFolders] = await Promise.all([
      getQualityProfilesFn(),
      getRootFoldersFn(),
    ]);
    return { qualityProfiles, rootFolders };
  },
  component: AddAuthorPage,
});

function AddAuthorPage() {
  const { qualityProfiles, rootFolders } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: {
    name: string;
    sortName: string;
    overview?: string;
    status: string;
    monitored: boolean;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => {
    setLoading(true);
    try {
      const author = await createAuthorFn({ data: values });
      toast.success("Author added");
      router.invalidate();
      navigate({
        to: "/authors/$authorId",
        params: { authorId: String(author.id) },
      });
    } catch {
      toast.error("Failed to add author");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Add Author" />
      <AuthorForm
        qualityProfiles={qualityProfiles}
        rootFolders={rootFolders}
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: "/authors" })}
        loading={loading}
        submitLabel="Add Author"
      />
    </div>
  );
}
