import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Textarea from "src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

type BookFormProps = {
  initialValues?: {
    title: string;
    authorId: number;
    description: string | null;
    releaseDate: string | null;
  };
  authors: Array<{ id: number; name: string }>;
  onSubmit: (values: {
    title: string;
    authorId: number;
    description: string | null;
    releaseDate: string | null;
  }) => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
};

export default function BookForm({
  initialValues,
  authors,
  onSubmit,
  onCancel,
  loading,
  submitLabel = "Save",
}: BookFormProps): JSX.Element {
  const [title, setTitle] = useState(initialValues?.title || "");
  const [authorId, setAuthorId] = useState<string>(
    initialValues?.authorId?.toString() || "",
  );
  const [description, setDescription] = useState(
    initialValues?.description || "",
  );
  const [releaseDate, setReleaseDate] = useState(
    initialValues?.releaseDate || "",
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      authorId: Number.parseInt(authorId, 10),
      description: description || null,
      releaseDate: releaseDate || null,
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
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Book description..."
          rows={4}
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
