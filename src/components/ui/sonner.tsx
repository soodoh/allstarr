import type { CSSProperties, JSX } from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps): JSX.Element => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      position="bottom-left"
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-border)",
          "--success-bg": "var(--color-popover)",
          "--success-text": "var(--color-popover-foreground)",
          "--success-border": "var(--color-border)",
          "--error-bg": "var(--color-popover)",
          "--error-text": "var(--color-popover-foreground)",
          "--error-border": "var(--color-border)",
          "--warning-bg": "var(--color-popover)",
          "--warning-text": "var(--color-popover-foreground)",
          "--warning-border": "var(--color-border)",
          "--info-bg": "var(--color-popover)",
          "--info-text": "var(--color-popover-foreground)",
          "--info-border": "var(--color-border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export default Toaster;
