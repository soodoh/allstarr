import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { cn } from "src/lib/utils";
import { LANGUAGES, LANGUAGE_MAP } from "src/lib/languages";

export default function LanguageMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
}): JSX.Element {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(value);

  // Filter languages: exclude already-selected, match search query
  const filtered = LANGUAGES.filter((lang) => {
    if (selectedSet.has(lang.code)) {
      return false;
    }
    if (!search) {
      return true;
    }
    const q = search.toLowerCase();
    return (
      lang.name.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q)
    );
  });

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    const items = listRef.current.querySelectorAll("[data-lang-item]");
    const target = items[highlightIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, open]);

  // Close dropdown on outside click
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

  const addLanguage = (code: string) => {
    onChange([...value, code]);
    setSearch("");
    setHighlightIndex(0);
    inputRef.current?.focus();
  };

  const removeLanguage = (code: string) => {
    if (value.length > 1) {
      onChange(value.filter((c) => c !== code));
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
        addLanguage(filtered[highlightIndex].code);
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
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Type to search languages..."
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {filtered.map((lang, i) => (
            <button
              key={lang.code}
              type="button"
              data-lang-item
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-default",
                i === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                addLanguage(lang.code);
              }}
            >
              {lang.name}
              <span className="ml-auto text-xs text-muted-foreground">
                {lang.code}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && search && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-center text-sm text-muted-foreground shadow-md">
          No languages found.
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((code) => (
            <Badge key={code} variant="secondary" className="gap-1">
              {LANGUAGE_MAP.get(code) ?? code}
              {value.length > 1 && (
                <button
                  type="button"
                  className="ml-0.5 rounded-full outline-none hover:bg-muted-foreground/20"
                  onClick={() => removeLanguage(code)}
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
