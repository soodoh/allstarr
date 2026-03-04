import type { JSX } from "react";
import { LANGUAGES, LANGUAGE_MAP } from "src/lib/languages";
import MultiSelect from "src/components/shared/multi-select";

const LANGUAGE_ITEMS = LANGUAGES.map((lang) => ({
  key: lang.code,
  label: lang.name,
  secondary: lang.code,
}));

export default function LanguageMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
}): JSX.Element {
  return (
    <MultiSelect
      items={LANGUAGE_ITEMS}
      value={value}
      onChange={onChange}
      displayMap={LANGUAGE_MAP}
      placeholder="Type to search languages..."
      emptyMessage="No languages found."
      minItems={1}
    />
  );
}
