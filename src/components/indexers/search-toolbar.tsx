import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";

type SearchToolbarProps = {
  defaultQuery: string;
  onSearch: (query: string) => void;
  searching: boolean;
  disabled?: boolean;
};

export default function SearchToolbar({
  defaultQuery,
  onSearch,
  searching,
  disabled,
}: SearchToolbarProps): React.JSX.Element {
  const [query, setQuery] = useState(defaultQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for releases..."
        className="flex-1"
      />
      <Button type="submit" disabled={disabled || searching || !query.trim()}>
        {searching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        <span className="ml-2">{searching ? "Searching..." : "Search"}</span>
      </Button>
    </form>
  );
}
