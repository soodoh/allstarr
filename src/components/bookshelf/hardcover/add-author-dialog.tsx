import { useState } from "react";
import type { JSX } from "react";
import AuthorPhoto from "src/components/bookshelf/authors/author-photo";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import type { HardcoverAuthorDetail } from "src/server/search";
import { useImportHardcoverAuthor } from "src/hooks/mutations";
import { getProfileIcon } from "src/lib/profile-icons";

type AddAuthorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  author: HardcoverAuthorDetail;
  downloadProfiles: Array<{ id: number; name: string; icon: string }>;
  onSuccess: (authorId: number) => void;
};

export default function AddAuthorDialog({
  open,
  onOpenChange,
  author,
  downloadProfiles,
  onSuccess: _onSuccess,
}: AddAuthorDialogProps): JSX.Element {
  const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>(
    downloadProfiles.map((p) => p.id),
  );
  const importAuthor = useImportHardcoverAuthor();

  const toggleProfile = (id: number) => {
    setDownloadProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    importAuthor.mutate({
      foreignAuthorId: Number(author.id),
      downloadProfileIds,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Author to Bookshelf</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Author info */}
          <div className="flex items-center gap-3">
            <AuthorPhoto
              name={author.name}
              imageUrl={author.imageUrl}
              className="h-14 w-14 shrink-0 rounded-full"
            />
            <div className="min-w-0">
              <p className="font-semibold truncate">{author.name}</p>
              {author.booksCount !== null &&
                author.booksCount !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    {author.booksCount} book{author.booksCount === 1 ? "" : "s"}
                    {" — all books, editions & series will be imported"}
                  </p>
                )}
            </div>
          </div>

          {/* Download profiles */}
          <div className="space-y-2">
            <Label>Download Profiles</Label>
            {downloadProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No download profiles available.
              </p>
            ) : (
              <div className="space-y-2">
                {downloadProfiles.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={downloadProfileIds.includes(p.id)}
                      onCheckedChange={() => toggleProfile(p.id)}
                    />
                    {(() => {
                      const Icon = getProfileIcon(p.icon);
                      return <Icon className="h-4 w-4 text-muted-foreground" />;
                    })()}
                    <span className="text-sm">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Add to Bookshelf</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
