import type { JSX } from "react";
import { LANGUAGES } from "src/lib/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

type LanguageSingleSelectProps = {
  value: string;
  onChange: (code: string) => void;
};

export default function LanguageSingleSelect({
  value,
  onChange,
}: LanguageSingleSelectProps): JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
