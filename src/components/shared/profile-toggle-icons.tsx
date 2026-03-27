import type { CSSProperties, JSX, MouseEvent } from "react";
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
  partialProfileIds?: number[];
  onToggle: (profileId: number) => void;
  size?: "sm" | "lg";
  direction?: "horizontal" | "vertical";
};

export default function ProfileToggleIcons({
  profiles,
  activeProfileIds,
  partialProfileIds = [],
  onToggle,
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
        const partial = partialProfileIds.includes(profile.id);
        const Icon = getProfileIcon(profile.icon);

        let ariaLabel: string;
        if (active) {
          ariaLabel = `Remove "${profile.name}" profile`;
        } else if (partial) {
          ariaLabel = `Monitor all for "${profile.name}" profile`;
        } else {
          ariaLabel = `Add "${profile.name}" profile`;
        }

        let stateClass: string;
        let inlineStyle: CSSProperties | undefined;
        if (active) {
          stateClass =
            "bg-primary/15 text-primary cursor-pointer hover:bg-destructive/15 hover:text-destructive";
          inlineStyle = undefined;
        } else if (partial) {
          stateClass =
            "text-primary cursor-pointer hover:bg-primary/15 hover:text-primary";
          inlineStyle = {
            background:
              "linear-gradient(135deg, var(--color-muted) 50%, color-mix(in oklch, var(--color-primary) 15%, transparent) 50%)",
          };
        } else {
          stateClass =
            "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer";
          inlineStyle = undefined;
        }

        return (
          <Tooltip key={profile.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onToggle(profile.id);
                }}
                aria-label={ariaLabel}
                className={cn(
                  "flex shrink-0 items-center justify-center rounded transition-colors",
                  isLg ? "h-9 w-9" : "h-6 w-6",
                  stateClass,
                )}
                style={inlineStyle}
              >
                <Icon className={cn(isLg ? "h-5 w-5" : "h-3.5 w-3.5")} />
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
