import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { cn } from "src/lib/utils";

export type MultiSelectItem<T extends string | number> = {
  key: T;
  label: string;
  secondary?: string;
};

export default function MultiSelect<T extends string | number>({
  items,
  value,
  onChange,
  displayMap,
  placeholder = "Type to search...",
  emptyMessage = "No results found.",
  disabled = false,
  minItems = 0,
}: {
  items: Array<MultiSelectItem<T>>;
  value: T[];
  onChange?: (keys: T[]) => void;
  displayMap?: Map<T, string>;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  minItems?: number;
}): JSX.Element {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(value);

  const filtered = items.filter((item) => {
    if (selectedSet.has(item.key)) {
      return false;
    }
    if (!search) {
      return true;
    }
    const q = search.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      (item.secondary?.toLowerCase().includes(q) ?? false)
    );
  });

  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    const items = listRef.current.querySelectorAll("[data-ms-item]");
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

  const addItem = (key: T) => {
    onChange?.([...value, key]);
    setSearch("");
    setHighlightIndex(0);
    inputRef.current?.focus();
  };

  const removeItem = (key: T) => {
    if (value.length > minItems) {
      onChange?.(value.filter((k) => k !== key));
    }
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
        addItem(filtered[highlightIndex].key);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const canRemove = !disabled && value.length > minItems;

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
        placeholder={disabled ? "" : placeholder}
        disabled={disabled}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />

      {open && !disabled && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {filtered.map((item, i) => (
            <button
              key={String(item.key)}
              type="button"
              data-ms-item
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-default",
                i === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                addItem(item.key);
              }}
            >
              {item.label}
              {item.secondary && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {item.secondary}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && !disabled && search && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-center text-sm text-muted-foreground shadow-md">
          {emptyMessage}
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((key) => (
            <Badge key={String(key)} variant="secondary" className="gap-1">
              {displayMap?.get(key) ?? String(key)}
              {canRemove && (
                <button
                  type="button"
                  className="ml-0.5 rounded-full outline-none hover:bg-muted-foreground/20"
                  onClick={() => removeItem(key)}
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
