import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface BookFormProps {
  initialValues?: {
    title: string;
    authorId: number;
    overview?: string;
    isbn?: string;
    asin?: string;
    releaseDate?: string;
    monitored: boolean;
  };
  authors: { id: number; name: string }[];
  onSubmit: (values: {
    title: string;
    authorId: number;
    overview?: string;
    isbn?: string;
    asin?: string;
    releaseDate?: string;
    monitored: boolean;
  }) => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
}

export function BookForm({
  initialValues,
  authors,
  onSubmit,
  onCancel,
  loading,
  submitLabel = "Save",
}: BookFormProps) {
  const [title, setTitle] = useState(initialValues?.title || "");
  const [authorId, setAuthorId] = useState<string>(
    initialValues?.authorId?.toString() || ""
  );
  const [overview, setOverview] = useState(initialValues?.overview || "");
  const [isbn, setIsbn] = useState(initialValues?.isbn || "");
  const [asin, setAsin] = useState(initialValues?.asin || "");
  const [releaseDate, setReleaseDate] = useState(
    initialValues?.releaseDate || ""
  );
  const [monitored, setMonitored] = useState(
    initialValues?.monitored ?? true
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      authorId: parseInt(authorId),
      overview: overview || undefined,
      isbn: isbn || undefined,
      asin: asin || undefined,
      releaseDate: releaseDate || undefined,
      monitored,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Book title"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Author</Label>
        <Select value={authorId} onValueChange={setAuthorId}>
          <SelectTrigger>
            <SelectValue placeholder="Select author" />
          </SelectTrigger>
          <SelectContent>
            {authors.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="overview">Overview</Label>
        <Textarea
          id="overview"
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          placeholder="Book description..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="isbn">ISBN</Label>
          <Input
            id="isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="ISBN"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="asin">ASIN</Label>
          <Input
            id="asin"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            placeholder="ASIN"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="releaseDate">Release Date</Label>
          <Input
            id="releaseDate"
            type="date"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="monitored"
          checked={monitored}
          onCheckedChange={setMonitored}
        />
        <Label htmlFor="monitored">Monitored</Label>
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading || !authorId}>
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
