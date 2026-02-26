import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUp, Folder, Loader2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { ScrollArea } from "src/components/ui/scroll-area";
import { browseDirectoryQuery } from "src/lib/queries";

type DirectoryBrowserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  initialPath?: string;
};

export default function DirectoryBrowserDialog({
  open,
  onOpenChange,
  onSelect,
  initialPath = "/",
}: DirectoryBrowserDialogProps): JSX.Element {
  const [currentPath, setCurrentPath] = useState(initialPath);

  // Reset to initialPath when the dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setCurrentPath(initialPath);
    }
    onOpenChange(nextOpen);
  };

  const { data, isLoading, error } = useQuery({
    ...browseDirectoryQuery(currentPath),
    // Only fetch while the dialog is actually open
    enabled: open,
  });

  function handleNavigate(targetPath: string) {
    setCurrentPath(targetPath);
  }

  function handleSelect() {
    onSelect(currentPath);
    onOpenChange(false);
  }

  function renderContent() {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read directory";
      return (
        <div className="flex items-start gap-2 p-4 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-sm">{message}</span>
        </div>
      );
    }

    const directories = data?.directories ?? [];
    const parentPath = data?.parent;

    return (
      <div className="flex flex-col">
        {/* Parent directory row */}
        {parentPath !== undefined && (
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left"
            onClick={() => handleNavigate(parentPath)}
          >
            <ArrowUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-mono">..</span>
          </button>
        )}

        {/* Subdirectory rows */}
        {directories.map((dir) => (
          <button
            key={dir.path}
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left"
            onClick={() => handleNavigate(dir.path)}
          >
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-mono truncate">{dir.name}</span>
          </button>
        ))}

        {/* Empty state */}
        {directories.length === 0 && !isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No subdirectories found
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Browse for Folder</DialogTitle>
        </DialogHeader>

        {/* Current path display */}
        <div className="rounded-md bg-muted px-3 py-2">
          <span className="font-mono text-sm break-all">{currentPath}</span>
        </div>

        {/* Directory listing */}
        <ScrollArea className="h-[300px] rounded-md border">
          {renderContent()}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelect}>Select Folder</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
