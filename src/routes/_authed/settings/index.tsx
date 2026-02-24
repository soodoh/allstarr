import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings, Sliders, FolderOpen, Download, Radar } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "~/components/ui/card";
import PageHeader from "~/components/shared/page-header";

export const Route = createFileRoute("/_authed/settings/")({
  component: SettingsPage,
});

const settingsItems = [
  {
    title: "General",
    to: "/settings/general" as const,
    icon: Settings,
    description: "Configure naming templates, log levels, and global app behavior.",
  },
  {
    title: "Profiles",
    to: "/settings/profiles" as const,
    icon: Sliders,
    description:
      "Manage quality profiles that define preferred formats and upgrade rules.",
  },
  {
    title: "Root Folders",
    to: "/settings/root-folders" as const,
    icon: FolderOpen,
    description: "Set up filesystem paths where your book files are stored.",
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
