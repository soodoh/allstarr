import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUp, Folder, FolderDot, Loader2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { ScrollArea } from "src/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/ui/tooltip";
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
  const [requestedPath, setRequestedPath] = useState(initialPath);
  const [showHidden, setShowHidden] = useState(true);

  const { data, isLoading, error } = useQuery({
    ...browseDirectoryQuery(requestedPath, showHidden),
    // Only fetch while the dialog is actually open
    enabled: open,
  });

  // The server resolves the actual path (e.g. falls back to cwd if requested path doesn't exist)
  const displayPath = data?.current ?? requestedPath;

  function handleNavigate(targetPath: string) {
    setRequestedPath(targetPath);
  }

  function handleSelect() {
    onSelect(displayPath);
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
        {parentPath !== null && parentPath !== undefined && (
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setRequestedPath(initialPath);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Browse for Folder</DialogTitle>
        </DialogHeader>

        {/* Current path display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md bg-muted px-3 py-2">
            <span className="font-mono text-sm break-all">{displayPath}</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHidden((v) => !v)}
                >
                  <FolderDot
                    className={`h-4 w-4 ${showHidden ? "" : "opacity-40"}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showHidden
                  ? "Hide hidden directories"
                  : "Show hidden directories"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
