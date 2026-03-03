import type { JSX, MouseEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "src/components/ui/tooltip";
import { cn } from "src/lib/utils";
import { getProfileIcon } from "src/lib/profile-icons";

type ProfileToggleIconsProps = {
  profiles: Array<{ id: number; name: string; icon: string }>;
  activeProfileIds: number[];
  onToggle: (profileId: number) => void;
  isPending?: boolean;
  size?: "sm" | "lg";
  direction?: "horizontal" | "vertical";
};

export default function ProfileToggleIcons({
  profiles,
  activeProfileIds,
  onToggle,
  isPending = false,
  size = "sm",
  direction = "horizontal",
}: ProfileToggleIconsProps): JSX.Element {
  const isLg = size === "lg";

  return (
    <div
      className={cn(
        "flex gap-1",
        direction === "vertical" ? "flex-col" : "flex-row",
      )}
    >
      {profiles.map((profile) => {
        const active = activeProfileIds.includes(profile.id);
        const Icon = getProfileIcon(profile.icon);

        return (
          <Tooltip key={profile.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  if (!isPending) {
                    onToggle(profile.id);
                  }
                }}
                disabled={isPending}
                aria-label={
                  active
                    ? `Remove "${profile.name}" profile`
                    : `Add "${profile.name}" profile`
                }
                className={cn(
                  "flex shrink-0 items-center justify-center rounded transition-colors",
                  isLg ? "h-9 w-9" : "h-6 w-6",
                  active
                    ? "bg-primary/15 text-primary cursor-pointer hover:bg-destructive/15 hover:text-destructive"
                    : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer",
                )}
              >
                {isPending ? (
                  <Loader2
                    className={cn(
                      "animate-spin",
                      isLg ? "h-5 w-5" : "h-3.5 w-3.5",
                    )}
                  />
                ) : (
                  <Icon className={cn(isLg ? "h-5 w-5" : "h-3.5 w-3.5")} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{profile.name}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
