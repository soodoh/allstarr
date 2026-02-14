import { BookOpen, Users, Eye, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface LibraryStatsProps {
  authorCount: number;
  bookCount: number;
  monitoredAuthors: number;
  monitoredBooks: number;
  editionCount: number;
}

export function LibraryStats({
  authorCount,
  bookCount,
  monitoredAuthors,
  monitoredBooks,
  editionCount,
}: LibraryStatsProps) {
  const stats = [
    {
      title: "Total Authors",
      value: authorCount,
      subtitle: `${monitoredAuthors} monitored`,
      icon: Users,
    },
    {
      title: "Total Books",
      value: bookCount,
      subtitle: `${monitoredBooks} monitored`,
      icon: BookOpen,
    },
    {
      title: "Monitored",
      value: monitoredAuthors + monitoredBooks,
      subtitle: "authors + books",
      icon: Eye,
    },
    {
      title: "Editions",
      value: editionCount,
      subtitle: "across all books",
      icon: Layers,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
