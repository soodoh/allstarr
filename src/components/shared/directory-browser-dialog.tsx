import { useEffect, useState } from "react";
import { AlertCircle, ArrowUp, Folder, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { browseDirectoryFn } from "~/server/filesystem";

type DirectoryEntry = {
  name: string;
  path: string;
};

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
}: DirectoryBrowserDialogProps): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentPath(initialPath);
    }
  }, [open, initialPath]);

  // Fetch directory listing whenever currentPath changes (and dialog is open)
  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    const fetchDirectory = async () => {
      try {
        const result = await browseDirectoryFn({ data: { path: currentPath } });
        if (!cancelled) {
          setDirectories(result.directories);
          setParentPath(result.parent);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Failed to read directory";
          setError(message);
          setDirectories([]);
          setParentPath(undefined);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchDirectory();

    return () => {
      cancelled = true;
    };
  }, [currentPath, open]);

  function handleNavigate(targetPath: string) {
    setCurrentPath(targetPath);
  }

  function handleSelect() {
    onSelect(currentPath);
    onOpenChange(false);
  }

  function renderContent() {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-start gap-2 p-4 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      );
    }

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
        {directories.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No subdirectories found
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
