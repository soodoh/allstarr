import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "~/components/shared/page-header";
import { BookForm } from "~/components/books/book-form";
import { createBookFn } from "~/server/books";
import { getAuthorsFn } from "~/server/authors";

export const Route = createFileRoute("/_authed/add/book")({
  loader: () => getAuthorsFn(),
  component: AddBookPage,
});

function AddBookPage() {
  const authors = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: {
    title: string;
    authorId: number;
    overview?: string;
    isbn?: string;
    asin?: string;
    releaseDate?: string;
    monitored: boolean;
  }) => {
    setLoading(true);
    try {
      const book = await createBookFn({ data: values });
      toast.success("Book added");
      router.invalidate();
      navigate({
        to: "/books/$bookId",
        params: { bookId: String(book.id) },
      });
    } catch {
      toast.error("Failed to add book");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Add Book" />
      {authors.length === 0 ? (
        <p className="text-muted-foreground">
          You need to add an author first before adding a book.
        </p>
      ) : (
        <BookForm
          authors={authors}
          onSubmit={handleSubmit}
          onCancel={() => navigate({ to: "/books" })}
          loading={loading}
          submitLabel="Add Book"
        />
      )}
    </div>
  );
}
