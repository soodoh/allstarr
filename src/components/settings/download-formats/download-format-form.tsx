import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import validateForm from "src/lib/form-validation";
import { createDownloadFormatSchema } from "src/lib/validators";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";

type Specification = {
  type: "releaseTitle" | "releaseGroup" | "size" | "indexerFlag";
  value: string;
  min?: number;
  max?: number;
  negate: boolean;
  required: boolean;
};

type SpecEntry = Specification & { _id: string };

type DownloadFormatFormValues = {
  title: string;
  weight: number;
  color: string;
  minSize: number;
  maxSize: number | null;
  preferredSize: number | null;
  specifications: Specification[];
  type: "ebook" | "audio" | "video";
  source: string | null;
  resolution: number;
  enabled: boolean;
};

type DownloadFormatFormProps = {
  initialValues?: DownloadFormatFormValues;
  type: "ebook" | "audio" | "video";
  onSubmit: (values: DownloadFormatFormValues) => void;
  onCancel: () => void;
  loading?: boolean;
};

const COLORS = [
  { value: "gray", label: "Gray" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "amber", label: "Amber" },
  { value: "yellow", label: "Yellow" },
  { value: "purple", label: "Purple" },
  { value: "cyan", label: "Cyan" },
  { value: "orange", label: "Orange" },
];

const SPEC_TYPES = [
  { value: "releaseTitle", label: "Release Title" },
  { value: "releaseGroup", label: "Release Group" },
  { value: "size", label: "Size" },
  { value: "indexerFlag", label: "Indexer Flag" },
] as const;

const VIDEO_SOURCES = [
  { value: "Television", label: "Television" },
  { value: "Web", label: "Web" },
  { value: "WebRip", label: "WebRip" },
  { value: "Bluray", label: "Bluray" },
  { value: "BlurayRaw", label: "Bluray Raw" },
  { value: "DVD", label: "DVD" },
  { value: "Unknown", label: "Unknown" },
] as const;

const VIDEO_RESOLUTIONS = [
  { value: 0, label: "Unknown" },
  { value: 480, label: "480p" },
  { value: 576, label: "576p" },
  { value: 720, label: "720p" },
  { value: 1080, label: "1080p" },
  { value: 2160, label: "2160p (4K)" },
] as const;

const COLOR_CLASSES: Record<string, string> = {
  gray: "bg-gray-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
  orange: "bg-orange-500",
};

function toEntries(specs: Specification[]): SpecEntry[] {
  const result: SpecEntry[] = [];
  for (const s of specs) {
    result.push({
      type: s.type,
      value: s.value,
      min: s.min,
      max: s.max,
      negate: s.negate,
      required: s.required,
      _id: crypto.randomUUID(),
    });
  }
  return result;
}

function SpecificationRow({
  spec,
  onChange,
  onRemove,
}: {
  spec: Specification;
  onChange: (spec: Specification) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Select
          value={spec.type}
          onValueChange={(v) =>
            onChange({
              ...spec,
              type: v as Specification["type"],
              value: "",
              min: undefined,
              max: undefined,
            })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEC_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(spec.type === "releaseTitle" || spec.type === "releaseGroup") && (
          <Input
            value={spec.value}
            onChange={(e) => onChange({ ...spec, value: e.target.value })}
            placeholder="Regex pattern"
            className="flex-1"
          />
        )}

        {spec.type === "size" && (
          <div className="flex items-center gap-2 flex-1">
            <Input
              type="number"
              value={spec.min ?? ""}
              onChange={(e) =>
                onChange({
                  ...spec,
                  min: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Min (MB)"
              className="w-24"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="number"
              value={spec.max ?? ""}
              onChange={(e) =>
                onChange({
                  ...spec,
                  max: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Max (MB)"
              className="w-24"
            />
          </div>
        )}

        {spec.type === "indexerFlag" && (
          <Input
            value={spec.value}
            onChange={(e) => onChange({ ...spec, value: e.target.value })}
            placeholder="Flag bit value"
            className="w-32"
          />
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={spec.negate}
            onCheckedChange={(v) => onChange({ ...spec, negate: v })}
          />
          <span className="text-sm text-muted-foreground">Negate</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={spec.required}
            onCheckedChange={(v) => onChange({ ...spec, required: v })}
          />
          <span className="text-sm text-muted-foreground">Required</span>
        </div>
      </div>
    </div>
  );
}

function SpecificationsEditor({
  specifications,
  onAdd,
  onUpdate,
  onRemove,
}: {
  specifications: SpecEntry[];
  onAdd: () => void;
  onUpdate: (id: string, spec: Specification) => void;
  onRemove: (id: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Specifications</Label>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" />
          Add Condition
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Required conditions must ALL match. Non-required conditions need at
        least one match.
      </p>
      <div className="space-y-2">
        {specifications.map((spec) => (
          <SpecificationRow
            key={spec._id}
            spec={spec}
            onChange={(s) => onUpdate(spec._id, s)}
            onRemove={() => onRemove(spec._id)}
          />
        ))}
        {specifications.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No conditions &mdash; this definition won&apos;t match any releases
          </p>
        )}
      </div>
    </div>
  );
}

function defaultMaxSize(t: "ebook" | "audio" | "video"): number {
  if (t === "audio") {
    return 350;
  }
  if (t === "video") {
    return 1000;
  }
  return 100;
}

function SizeLimitField({
  id,
  label,
  value,
  noLimit,
  onValueChange,
  onNoLimitChange,
}: {
  id: string;
  label: string;
  value: number;
  noLimit: boolean;
  onValueChange: (v: number) => void;
  onNoLimitChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        disabled={noLimit}
        onChange={(e) => onValueChange(Number(e.target.value))}
      />
      <div className="flex items-center gap-1.5">
        <Checkbox
          id={id}
          checked={noLimit}
          onCheckedChange={(v) => onNoLimitChange(v === true)}
        />
        <label
          htmlFor={id}
          className="text-xs text-muted-foreground cursor-pointer"
        >
          No Limit
        </label>
      </div>
    </div>
  );
}

function VideoFields({
  source,
  resolution,
  onSourceChange,
  onResolutionChange,
}: {
  source: string;
  resolution: number;
  onSourceChange: (v: string) => void;
  onResolutionChange: (v: number) => void;
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="video-source">Source</Label>
        <Select value={source} onValueChange={onSourceChange}>
          <SelectTrigger id="video-source" className="w-full">
            <SelectValue placeholder="Any source" />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="video-resolution">Resolution</Label>
        <Select
          value={String(resolution)}
          onValueChange={(v) => onResolutionChange(Number(v))}
        >
          <SelectTrigger id="video-resolution" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_RESOLUTIONS.map((r) => (
              <SelectItem key={r.value} value={String(r.value)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function updateSpecById(
  prev: SpecEntry[],
  id: string,
  updated: Specification,
): SpecEntry[] {
  return prev.map((s) => (s._id === id ? { ...updated, _id: id } : s));
}

function useBasicFormFields(
  initialValues: DownloadFormatFormValues | undefined,
  type: "ebook" | "audio" | "video",
) {
  const resolvedType = initialValues?.type ?? type;
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [weight, setWeight] = useState(initialValues?.weight ?? 1);
  const [color, setColor] = useState(initialValues?.color ?? "gray");
  const [source, setSource] = useState<string>(initialValues?.source ?? "");
  const [resolution, setResolution] = useState<number>(
    initialValues?.resolution ?? 0,
  );
  const [enabled, setEnabled] = useState<boolean>(
    initialValues?.enabled ?? true,
  );
  return {
    resolvedType,
    title,
    setTitle,
    weight,
    setWeight,
    color,
    setColor,
    source,
    setSource,
    resolution,
    setResolution,
    enabled,
    setEnabled,
  };
}

function useSizeFormFields(
  initialValues: DownloadFormatFormValues | undefined,
  type: "ebook" | "audio" | "video",
) {
  const [minSize, setMinSize] = useState(initialValues?.minSize ?? 0);
  const [maxSize, setMaxSize] = useState<number>(
    initialValues?.maxSize ?? defaultMaxSize(type),
  );
  const [maxNoLimit, setMaxNoLimit] = useState<boolean>(
    initialValues?.maxSize === null,
  );
  const [preferredSize, setPreferredSize] = useState<number>(
    initialValues?.preferredSize ?? defaultMaxSize(type),
  );
  const [preferredNoLimit, setPreferredNoLimit] = useState<boolean>(
    initialValues?.preferredSize === null,
  );
  const [specifications, setSpecifications] = useState<SpecEntry[]>(() =>
    toEntries(initialValues?.specifications ?? []),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  return {
    minSize,
    setMinSize,
    maxSize,
    setMaxSize,
    maxNoLimit,
    setMaxNoLimit,
    preferredSize,
    setPreferredSize,
    preferredNoLimit,
    setPreferredNoLimit,
    specifications,
    setSpecifications,
    errors,
    setErrors,
  };
}

export default function DownloadFormatForm({
  initialValues,
  type,
  onSubmit,
  onCancel,
  loading,
}: DownloadFormatFormProps): JSX.Element {
  const {
    resolvedType,
    title,
    setTitle,
    weight,
    setWeight,
    color,
    setColor,
    source,
    setSource,
    resolution,
    setResolution,
    enabled,
    setEnabled,
  } = useBasicFormFields(initialValues, type);

  const {
    minSize,
    setMinSize,
    maxSize,
    setMaxSize,
    maxNoLimit,
    setMaxNoLimit,
    preferredSize,
    setPreferredSize,
    preferredNoLimit,
    setPreferredNoLimit,
    specifications,
    setSpecifications,
    errors,
    setErrors,
  } = useSizeFormFields(initialValues, type);

  const handleAddSpec = () => {
    setSpecifications((prev) => [
      ...prev,
      {
        type: "releaseTitle",
        value: "",
        negate: false,
        required: true,
        _id: crypto.randomUUID(),
      },
    ]);
  };

  const handleUpdateSpec = (id: string, updated: Specification) => {
    setSpecifications((prev) => updateSpecById(prev, id, updated));
  };

  const handleRemoveSpec = (id: string) => {
    setSpecifications((prev) => prev.filter((s) => s._id !== id));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const strippedSpecs = specifications.map(({ _id, ...rest }) => rest);
    const effectiveMax = maxNoLimit ? null : maxSize;
    const effectivePreferred = preferredNoLimit ? null : preferredSize;
    const payload: DownloadFormatFormValues = {
      title,
      weight,
      color,
      minSize,
      maxSize: effectiveMax,
      preferredSize: effectivePreferred,
      specifications: strippedSpecs,
      type: resolvedType,
      source: source || null,
      resolution,
      enabled,
    };
    const result = validateForm(createDownloadFormatSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(payload);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 max-h-[70vh] overflow-y-auto pr-1"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="def-title">Title</Label>
          <Input
            id="def-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Format name"
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="def-weight">Weight</Label>
          <Input
            id="def-weight"
            type="number"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <Select value={color} onValueChange={setColor}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLORS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full ${COLOR_CLASSES[c.value]}`}
                  />
                  {c.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Size Limits (MB)</Label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Min</Label>
            <Input
              type="number"
              value={minSize}
              onChange={(e) => setMinSize(Number(e.target.value))}
            />
          </div>
          <SizeLimitField
            id="preferred-no-limit"
            label="Preferred"
            value={preferredSize}
            noLimit={preferredNoLimit}
            onValueChange={setPreferredSize}
            onNoLimitChange={(checked) => {
              setPreferredNoLimit(checked);
              if (!checked) {
                setPreferredSize(defaultMaxSize(resolvedType));
              }
            }}
          />
          <SizeLimitField
            id="max-no-limit"
            label="Max"
            value={maxSize}
            noLimit={maxNoLimit}
            onValueChange={setMaxSize}
            onNoLimitChange={(checked) => {
              setMaxNoLimit(checked);
              if (!checked) {
                setMaxSize(defaultMaxSize(resolvedType));
              }
            }}
          />
        </div>
      </div>

      {resolvedType === "video" && (
        <VideoFields
          source={source}
          resolution={resolution}
          onSourceChange={setSource}
          onResolutionChange={setResolution}
        />
      )}

      <div className="flex items-center gap-2">
        <Switch
          id="format-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="format-enabled" className="text-sm">
          Enabled
        </Label>
      </div>

      <SpecificationsEditor
        specifications={specifications}
        onAdd={handleAddSpec}
        onUpdate={handleUpdateSpec}
        onRemove={handleRemoveSpec}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
