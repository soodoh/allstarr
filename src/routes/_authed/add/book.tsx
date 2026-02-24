import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import PageHeader from "~/components/shared/page-header";
import BookForm from "~/components/books/book-form";
import { authorsListQuery } from "~/lib/queries";
import { useCreateBook } from "~/hooks/mutations";

export const Route = createFileRoute("/_authed/add/book")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(authorsListQuery()),
  component: AddBookPage,
});

function AddBookPage() {
  const { data: authors } = useSuspenseQuery(authorsListQuery());
  const navigate = useNavigate();
  const createBook = useCreateBook();

  const handleSubmit = (values: {
    title: string;
    authorId: number;
    overview?: string;
    isbn?: string;
    asin?: string;
    releaseDate?: string;
    monitored: boolean;
  }) => {
    createBook.mutate(values, {
      onSuccess: () => {
        navigate({ to: "/books" });
      },
    });
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
          loading={createBook.isPending}
          submitLabel="Add Book"
        />
      )}
    </div>
  );
}
