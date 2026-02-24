import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import BookDetailModal from "~/components/books/book-detail-modal";

type BookDetailModalContextType = {
  openBookModal: (bookId: number) => void;
};

const BookDetailModalContext = createContext<
  BookDetailModalContextType | undefined
>(undefined);

export function useBookDetailModal(): BookDetailModalContextType {
  const ctx = useContext(BookDetailModalContext);
  if (!ctx) {
    throw new Error(
      "useBookDetailModal must be used within BookDetailModalProvider",
    );
  }
  return ctx;
}

export default function BookDetailModalProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [bookId, setBookId] = useState<number | undefined>(undefined);

  const openBookModal = useCallback((id: number) => {
    setBookId(id);
  }, []);

  const contextValue = useMemo(() => ({ openBookModal }), [openBookModal]);

  return (
    <BookDetailModalContext.Provider value={contextValue}>
      {children}
      <BookDetailModal
        bookId={bookId}
        open={bookId !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setBookId(undefined);
          }
        }}
      />
    </BookDetailModalContext.Provider>
  );
}
