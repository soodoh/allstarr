import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { cn } from "src/lib/utils";
import { INDEXER_CATEGORIES, CATEGORY_MAP } from "src/lib/categories";

export default function CategoryMultiSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: number[];
  onChange?: (ids: number[]) => void;
  disabled?: boolean;
}): JSX.Element {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(value);

  const filtered = INDEXER_CATEGORIES.filter((cat) => {
    if (selectedSet.has(cat.id)) {
      return false;
    }
    if (!search) {
      return true;
    }
    const q = search.toLowerCase();
    return cat.name.toLowerCase().includes(q) || String(cat.id).includes(q);
  });

  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    const items = listRef.current.querySelectorAll("[data-cat-item]");
    const target = items[highlightIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, open]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const addCategory = (id: number) => {
    onChange?.([...value, id]);
    setSearch("");
    setHighlightIndex(0);
    inputRef.current?.focus();
  };

  const removeCategory = (id: number) => {
    onChange?.(value.filter((c) => c !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        addCategory(filtered[highlightIndex].id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative space-y-2">
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!open) {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "" : "Type to search categories..."}
        disabled={disabled}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />

      {open && !disabled && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {filtered.map((cat, i) => (
            <button
              key={cat.id}
              type="button"
              data-cat-item
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-default",
                i === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                addCategory(cat.id);
              }}
            >
              {cat.name}
              <span className="ml-auto text-xs text-muted-foreground">
                {cat.id}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && !disabled && search && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-center text-sm text-muted-foreground shadow-md">
          No categories found.
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              {CATEGORY_MAP.get(id) ?? id}
              {!disabled && (
                <button
                  type="button"
                  className="ml-0.5 rounded-full outline-none hover:bg-muted-foreground/20"
                  onClick={() => removeCategory(id)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
