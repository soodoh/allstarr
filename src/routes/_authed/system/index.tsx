import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import PageHeader from "~/components/shared/page-header";

export const Route = createFileRoute("/_authed/system/")({
  component: SystemPage,
});

const systemItems = [
  {
    title: "Status",
    to: "/system/status" as const,
    icon: Activity,
    description:
      "Health checks, disk space, and system information at a glance.",
  },
  {
    title: "History",
    to: "/history" as const,
    icon: History,
    description:
      "View a log of all events — books added, updated, deleted, and more.",
  },
];

function SystemPage() {
  return (
    <div>
      <PageHeader
        title="System"
        description="Monitor activity and manage system-level features."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {systemItems.map((item) => (
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
