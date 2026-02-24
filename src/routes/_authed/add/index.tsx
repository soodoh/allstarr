import { createFileRoute, Link } from "@tanstack/react-router";
import { UserPlus, BookPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import PageHeader from "~/components/shared/page-header";

export const Route = createFileRoute("/_authed/add/")({
  component: AddNewPage,
});

const addItems = [
  {
    title: "Add Author",
    to: "/add/author" as const,
    icon: UserPlus,
    description: "Search Hardcover for an author and add them to your library.",
  },
  {
    title: "Add Book",
    to: "/add/book" as const,
    icon: BookPlus,
    description:
      "Search Hardcover for a specific book and add it to your collection.",
  },
];

function AddNewPage() {
  return (
    <div>
      <PageHeader
        title="Add New"
        description="Search Hardcover to add authors or books to your library."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {addItems.map((item) => (
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
