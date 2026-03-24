import { useState } from "react";
import type { JSX } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import Label from "src/components/ui/label";

type UnmonitorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  itemTitle: string;
  itemType: "book" | "episode" | "season" | "show" | "movie";
  fileCount: number;
  onConfirm: (deleteFiles: boolean) => void;
  isPending: boolean;
};

export default function UnmonitorDialog({
  open,
  onOpenChange,
  profileName,
  itemTitle,
  itemType,
  fileCount,
  onConfirm,
  isPending,
}: UnmonitorDialogProps): JSX.Element {
  const [deleteFiles, setDeleteFiles] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDeleteFiles(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unmonitor {profileName}?</DialogTitle>
          <DialogDescription>
            This will stop searching for {itemType} &ldquo;{itemTitle}&rdquo;
            for this profile.
          </DialogDescription>
        </DialogHeader>

        {fileCount > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="delete-files"
              checked={deleteFiles}
              onCheckedChange={(checked) => setDeleteFiles(checked === true)}
            />
            <Label htmlFor="delete-files" className="cursor-pointer">
              Also delete {fileCount} file(s)
            </Label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(deleteFiles)}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
