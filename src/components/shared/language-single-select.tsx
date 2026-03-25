import { useState } from "react";
import type { JSX } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { LANGUAGES } from "src/lib/languages";
import { cn } from "src/lib/utils";
import { Button } from "src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "src/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "src/components/ui/command";

type LanguageSingleSelectProps = {
  value: string;
  onChange: (code: string) => void;
};

export default function LanguageSingleSelect({
  value,
  onChange,
}: LanguageSingleSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const selectedLabel = LANGUAGES.find((l) => l.code === value)?.name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls="language-listbox"
          className="w-full justify-between font-normal"
        >
          {selectedLabel ?? "Select language"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput placeholder="Search languages..." />
          <CommandList id="language-listbox">
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              {LANGUAGES.map((lang) => (
                <CommandItem
                  key={lang.code}
                  value={lang.name}
                  onSelect={() => {
                    onChange(lang.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === lang.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {lang.name}{" "}
                  <span className="text-muted-foreground">({lang.code})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
