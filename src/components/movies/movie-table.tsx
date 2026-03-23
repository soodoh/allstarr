import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { JSX } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Film,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";

type Movie = {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  studio: string;
  status: string;
  monitored: boolean;
  posterUrl: string;
  hasFile: boolean;
};

type MovieTableProps = {
  movies: Movie[];
};

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  released: { className: "bg-green-600", label: "Released" },
  inCinemas: { className: "bg-blue-600", label: "In Cinemas" },
  announced: { className: "bg-yellow-600", label: "Announced" },
  tba: { className: "bg-zinc-600", label: "TBA" },
};

type SortableKey = "title" | "year" | "studio" | "status";

export default function MovieTable({ movies }: MovieTableProps): JSX.Element {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortableKey | undefined>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortableKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...movies].toSorted((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "title": {
            cmp = a.sortTitle.localeCompare(b.sortTitle);
            break;
          }
          case "year": {
            cmp = a.year - b.year;
            break;
          }
          case "studio": {
            cmp = a.studio.localeCompare(b.studio);
            break;
          }
          case "status": {
            cmp = a.status.localeCompare(b.status);
            break;
          }
          default: {
            break;
          }
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : movies;

  const SortIcon = ({ col }: { col: SortableKey }) => {
    if (sortKey !== col) {
      return (
        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
      );
    }
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
    );
  };

  return (
    <Table>
      <colgroup>
        <col className="w-14" />
        <col />
        <col className="w-20" />
        <col />
        <col className="w-28" />
        <col className="w-24" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead />
          {(
            [
              { key: "title", label: "Title" },
              { key: "year", label: "Year" },
              { key: "studio", label: "Studio" },
              { key: "status", label: "Status" },
            ] as Array<{ key: SortableKey; label: string }>
          ).map(({ key, label }) => (
            <TableHead
              key={key}
              className="cursor-pointer select-none hover:text-foreground"
              onClick={() => handleSort(key)}
            >
              {label}
              <SortIcon col={key} />
            </TableHead>
          ))}
          <TableHead>Monitored</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((movie) => {
          const badge = STATUS_BADGE[movie.status] ?? STATUS_BADGE.tba;
          return (
            <TableRow
              key={movie.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() =>
                navigate({
                  to: "/movies/$movieId",
                  params: { movieId: String(movie.id) },
                })
              }
            >
              <TableCell>
                {movie.posterUrl ? (
                  <img
                    src={movie.posterUrl}
                    alt={movie.title}
                    className="aspect-[2/3] w-full rounded-sm object-cover"
                  />
                ) : (
                  <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                    <Film className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link
                  to="/movies/$movieId"
                  params={{ movieId: String(movie.id) }}
                  className="font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {movie.title}
                </Link>
              </TableCell>
              <TableCell>{movie.year > 0 ? movie.year : "\u2014"}</TableCell>
              <TableCell className="text-muted-foreground">
                {movie.studio || "\u2014"}
              </TableCell>
              <TableCell>
                <Badge className={badge.className}>{badge.label}</Badge>
              </TableCell>
              <TableCell>
                {movie.monitored ? (
                  <Eye className="h-4 w-4 text-green-400" />
                ) : (
                  <EyeOff className="h-4 w-4 text-zinc-500" />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
