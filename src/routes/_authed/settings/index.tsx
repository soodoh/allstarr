import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Settings,
  Sliders,
  FileType,
  Download,
  HardDrive,
  Radar,
  FileText,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "src/components/ui/card";
import PageHeader from "src/components/shared/page-header";

export const Route = createFileRoute("/_authed/settings/")({
  component: SettingsPage,
});

const settingsItems = [
  {
    title: "General",
    to: "/settings/general" as const,
    icon: Settings,
    description: "Configure log levels, API key, and global app behavior.",
  },
  {
    title: "Media Management",
    to: "/settings/media-management" as const,
    icon: HardDrive,
    description:
      "Configure book naming, file import behavior, permissions, and recycling bin.",
  },
  {
    title: "Metadata",
    to: "/settings/metadata" as const,
    icon: FileText,
    description: "Configure language preferences and book import filters.",
  },
  {
    title: "Formats",
    to: "/settings/formats" as const,
    icon: FileType,
    description:
      "Define format types like EPUB, MOBI, PDF and their matching rules.",
  },
  {
    title: "Profiles",
    to: "/settings/profiles" as const,
    icon: Sliders,
    description: "Configure format preferences and upgrade rules per author.",
  },
  {
    title: "Download Clients",
    to: "/settings/download-clients" as const,
    icon: Download,
    description:
      "Connect download clients (e.g. qBittorrent, SABnzbd) used to grab books.",
  },
  {
    title: "Indexers",
    to: "/settings/indexers" as const,
    icon: Radar,
    description:
      "Configure Usenet or torrent indexers used to search for book releases.",
  },
];

function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your Allstarr configuration."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsItems.map((item) => (
          <Link key={item.title} to={item.to}>
            <Card className="h-full transition-colors hover:border-primary hover:bg-accent/50 cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <item.icon className="h-6 w-6 text-primary" />
                  <CardTitle>{item.title}</CardTitle>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
