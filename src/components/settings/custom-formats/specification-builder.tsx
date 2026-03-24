import { useMemo, useRef } from "react";
import type { JSX } from "react";
import { HelpCircle, Plus, X } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/ui/tooltip";
import type { cfSpecificationTypes } from "src/lib/validators";

export type Spec = {
  name: string;
  type: (typeof cfSpecificationTypes)[number];
  value?: string;
  min?: number;
  max?: number;
  negate: boolean;
  required: boolean;
};

// Grouped specification types
const SPEC_TYPE_GROUPS = [
  {
    label: "Universal",
    types: [
      { value: "releaseTitle", label: "Release Title" },
      { value: "releaseGroup", label: "Release Group" },
      { value: "size", label: "Size" },
      { value: "indexerFlag", label: "Indexer Flag" },
      { value: "language", label: "Language" },
    ],
  },
  {
    label: "Video",
    types: [
      { value: "videoSource", label: "Video Source" },
      { value: "resolution", label: "Resolution" },
      { value: "qualityModifier", label: "Quality Modifier" },
      { value: "edition", label: "Edition" },
      { value: "videoCodec", label: "Video Codec" },
      { value: "audioCodec", label: "Audio Codec" },
      { value: "audioChannels", label: "Audio Channels" },
      { value: "hdrFormat", label: "HDR Format" },
      { value: "streamingService", label: "Streaming Service" },
      { value: "releaseType", label: "Release Type" },
      { value: "year", label: "Year" },
    ],
  },
  {
    label: "Book / Audiobook",
    types: [
      { value: "fileFormat", label: "File Format" },
      { value: "audioBitrate", label: "Audio Bitrate" },
      { value: "narrator", label: "Narrator" },
      { value: "publisher", label: "Publisher" },
      { value: "audioDuration", label: "Audio Duration" },
    ],
  },
] as const;

// Enum options per type
const ENUM_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  videoSource: [
    { value: "webdl", label: "WEB-DL" },
    { value: "webrip", label: "WEBRip" },
    { value: "bluray", label: "Blu-ray" },
    { value: "hdtv", label: "HDTV" },
    { value: "dvd", label: "DVD" },
  ],
  resolution: [
    { value: "r2160p", label: "2160p (4K)" },
    { value: "r1080p", label: "1080p" },
    { value: "r720p", label: "720p" },
    { value: "r480p", label: "480p" },
  ],
  qualityModifier: [
    { value: "remux", label: "Remux" },
    { value: "brdisk", label: "BR-DISK" },
    { value: "screener", label: "Screener" },
    { value: "regional", label: "Regional" },
    { value: "rawhd", label: "Raw HD" },
  ],
  audioChannels: [
    { value: "7.1", label: "7.1" },
    { value: "5.1", label: "5.1" },
    { value: "2.0", label: "2.0 (Stereo)" },
    { value: "1.0", label: "1.0 (Mono)" },
  ],
  hdrFormat: [
    { value: "dolbyvision", label: "Dolby Vision" },
    { value: "hdr10plus", label: "HDR10+" },
    { value: "hdr10", label: "HDR10" },
    { value: "hlg", label: "HLG" },
  ],
  streamingService: [
    { value: "amzn", label: "Amazon" },
    { value: "nf", label: "Netflix" },
    { value: "atvp", label: "Apple TV+" },
    { value: "dsnp", label: "Disney+" },
    { value: "hmax", label: "HBO Max" },
    { value: "pmtp", label: "Paramount+" },
  ],
  releaseType: [
    { value: "singleEpisode", label: "Single Episode" },
    { value: "multiEpisode", label: "Multi Episode" },
    { value: "seasonPack", label: "Season Pack" },
  ],
  fileFormat: [
    { value: "epub", label: "EPUB" },
    { value: "mobi", label: "MOBI" },
    { value: "pdf", label: "PDF" },
    { value: "azw3", label: "AZW3" },
    { value: "cbr", label: "CBR" },
    { value: "cbz", label: "CBZ" },
    { value: "m4b", label: "M4B" },
    { value: "mp3", label: "MP3" },
    { value: "flac", label: "FLAC" },
    { value: "ogg", label: "OGG" },
  ],
  language: [
    { value: "en", label: "English" },
    { value: "ja", label: "Japanese" },
    { value: "de", label: "German" },
    { value: "fr", label: "French" },
    { value: "es", label: "Spanish" },
    { value: "it", label: "Italian" },
    { value: "pt", label: "Portuguese" },
    { value: "ko", label: "Korean" },
    { value: "zh", label: "Chinese" },
    { value: "ru", label: "Russian" },
  ],
};

// Regex types use a text input with monospace font
const REGEX_TYPES = new Set([
  "releaseTitle",
  "releaseGroup",
  "edition",
  "videoCodec",
  "audioCodec",
  "narrator",
  "publisher",
]);

// Range types use two number inputs (min/max)
const RANGE_TYPES = new Set(["size", "audioBitrate", "audioDuration", "year"]);

// Flag types use a text input
const FLAG_TYPES = new Set(["indexerFlag"]);

function getInputType(specType: string): "regex" | "enum" | "range" | "flag" {
  if (REGEX_TYPES.has(specType)) {
    return "regex";
  }
  if (RANGE_TYPES.has(specType)) {
    return "range";
  }
  if (FLAG_TYPES.has(specType)) {
    return "flag";
  }
  if (ENUM_OPTIONS[specType]) {
    return "enum";
  }
  return "regex"; // fallback
}

function getTypeLabel(type: string): string {
  for (const group of SPEC_TYPE_GROUPS) {
    for (const t of group.types) {
      if (t.value === type) {
        return t.label;
      }
    }
  }
  return type;
}

type SpecWithKey = Spec & { _key: number };

type SpecRowProps = {
  spec: SpecWithKey;
  index: number;
  onChange: (index: number, spec: Spec) => void;
  onRemove: (index: number) => void;
};

function SpecRow({
  spec,
  index,
  onChange,
  onRemove,
}: SpecRowProps): JSX.Element {
  const inputType = getInputType(spec.type);

  const updateField = <K extends keyof Spec>(field: K, value: Spec[K]) => {
    onChange(index, { ...spec, [field]: value });
  };

  const handleTypeChange = (newType: Spec["type"]) => {
    // Reset value fields when type changes
    const newInputType = getInputType(newType);
    const updated: Spec = {
      ...spec,
      type: newType,
      name: getTypeLabel(newType),
    };
    if (newInputType === "range") {
      updated.value = undefined;
      updated.min = undefined;
      updated.max = undefined;
    } else {
      updated.value = "";
      updated.min = undefined;
      updated.max = undefined;
    }
    onChange(index, updated);
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Select value={spec.type} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {SPEC_TYPE_GROUPS.map((group, gi) => (
                <SelectGroup key={group.label}>
                  {gi > 0 && <SelectSeparator />}
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.types.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-6 shrink-0"
          onClick={() => onRemove(index)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Value input */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Value</Label>
        {inputType === "regex" && (
          <Input
            value={spec.value ?? ""}
            onChange={(e) => updateField("value", e.target.value)}
            placeholder="Regex pattern..."
            className="font-mono"
          />
        )}
        {inputType === "flag" && (
          <Input
            value={spec.value ?? ""}
            onChange={(e) => updateField("value", e.target.value)}
            placeholder="Flag value..."
          />
        )}
        {inputType === "enum" && (
          <Select
            value={spec.value ?? ""}
            onValueChange={(v) => updateField("value", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select value" />
            </SelectTrigger>
            <SelectContent>
              {(ENUM_OPTIONS[spec.type] ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {inputType === "range" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={spec.min ?? ""}
              onChange={(e) =>
                updateField(
                  "min",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              placeholder="Min"
              className="w-full"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="number"
              value={spec.max ?? ""}
              onChange={(e) =>
                updateField(
                  "max",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              placeholder="Max"
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* Toggles row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`spec-${index}-required`}
            checked={spec.required}
            onCheckedChange={(checked) =>
              updateField("required", checked === true)
            }
          />
          <Label htmlFor={`spec-${index}-required`} className="text-xs">
            Required
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`spec-${index}-negate`}
            checked={spec.negate}
            onCheckedChange={(checked) =>
              updateField("negate", checked === true)
            }
          />
          <Label htmlFor={`spec-${index}-negate`} className="text-xs">
            Negate
          </Label>
        </div>
      </div>
    </div>
  );
}

type SpecificationBuilderProps = {
  value: Spec[];
  onChange: (specs: Spec[]) => void;
};

export default function SpecificationBuilder({
  value,
  onChange,
}: SpecificationBuilderProps): JSX.Element {
  const nextKeyRef = useRef(value.length);

  // Assign stable keys to specs that don't have them
  const keyedSpecs = useMemo(() => {
    return value.map((spec) => {
      if ("_key" in spec && typeof (spec as SpecWithKey)._key === "number") {
        return spec as SpecWithKey;
      }
      const keyed = { ...spec, _key: nextKeyRef.current };
      nextKeyRef.current += 1;
      return keyed;
    });
  }, [value]);

  const handleAdd = () => {
    const key = nextKeyRef.current;
    nextKeyRef.current += 1;
    const newSpec: SpecWithKey = {
      name: "Release Title",
      type: "releaseTitle",
      value: "",
      negate: false,
      required: true,
      _key: key,
    };
    // Strip _key before calling onChange
    const updated = [...keyedSpecs, newSpec];
    onChange(updated.map(({ _key: _, ...rest }) => rest));
  };

  const handleChange = (index: number, spec: Spec) => {
    const updated = [...value];
    updated[index] = spec;
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const hasRequired = useMemo(() => value.some((s) => s.required), [value]);
  const hasOptional = useMemo(() => value.some((s) => !s.required), [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label>Specifications</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[280px]">
              <p>
                <strong>Required</strong> conditions use AND logic (all must
                match).
              </p>
              <p className="mt-1">
                <strong>Optional</strong> conditions use OR logic (at least one
                must match).
              </p>
              <p className="mt-1">
                <strong>Negate</strong> inverts the condition (must NOT match).
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {value.length > 0 && hasRequired && hasOptional && (
        <p className="text-xs text-muted-foreground">
          All required conditions AND at least one optional condition must
          match.
        </p>
      )}

      {keyedSpecs.map((spec, i) => (
        <SpecRow
          key={spec._key}
          spec={spec}
          index={i}
          onChange={handleChange}
          onRemove={handleRemove}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Condition
      </Button>
    </div>
  );
}
