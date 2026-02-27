import { useState } from "react";
import type { JSX } from "react";
import AuthorPhoto from "src/components/authors/author-photo";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import Label from "src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import type { HardcoverAuthorDetail } from "src/server/search";
import { useImportHardcoverAuthor } from "src/hooks/mutations";

type AddAuthorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  author: HardcoverAuthorDetail;
  qualityProfiles: Array<{ id: number; name: string }>;
  rootFolders: Array<{ id: number; path: string }>;
  onSuccess: (authorId: number) => void;
};

export default function AddAuthorDialog({
  open,
  onOpenChange,
  author,
  qualityProfiles,
  rootFolders,
  onSuccess: _onSuccess,
}: AddAuthorDialogProps): JSX.Element {
  const [qualityProfileId, setQualityProfileId] = useState<string>(
    qualityProfiles.length > 0 ? String(qualityProfiles[0].id) : "",
  );
  const [rootFolderPath, setRootFolderPath] = useState<string>(
    rootFolders.length > 0 ? rootFolders[0].path : "",
  );
  const importAuthor = useImportHardcoverAuthor();

  const handleSubmit = () => {
    importAuthor.mutate({
      foreignAuthorId: Number(author.id),
      qualityProfileId: qualityProfileId
        ? Number.parseInt(qualityProfileId, 10)
        : null,
      rootFolderPath: rootFolderPath || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Author to Library</DialogTitle>
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

          {/* Quality profile */}
          <div className="space-y-1.5">
            <Label>Quality Profile</Label>
            <Select
              value={qualityProfileId}
              onValueChange={setQualityProfileId}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {qualityProfiles.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Root folder */}
          <div className="space-y-1.5">
            <Label>Root Folder</Label>
            <Select value={rootFolderPath} onValueChange={setRootFolderPath}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {rootFolders.map((f) => (
                  <SelectItem key={f.id} value={f.path}>
                    {f.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Add to Library</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
