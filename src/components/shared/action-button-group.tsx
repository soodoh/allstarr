import type { JSX } from "react";
import { ExternalLink, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/ui/tooltip";

type ActionButtonGroupProps = {
  onRefreshMetadata: () => void;
  isRefreshing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  externalUrl: string | null;
  externalLabel: string;
};

export default function ActionButtonGroup({
  onRefreshMetadata,
  isRefreshing,
  onEdit,
  onDelete,
  externalUrl,
  externalLabel,
}: ActionButtonGroupProps): JSX.Element {
  return (
    <TooltipProvider>
      <div className="inline-flex -space-x-px">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-none first:rounded-l-md"
              onClick={onRefreshMetadata}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Update Metadata</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-none"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`rounded-none ${externalUrl ? "" : "last:rounded-r-md"}`}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>

        {externalUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-none last:rounded-r-md"
                asChild
              >
                <a href={externalUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{externalLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
