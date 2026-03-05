import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import validateForm from "src/lib/form-validation";
import { createQualityDefinitionSchema } from "src/lib/validators";
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

type QualityDefinitionFormValues = {
  title: string;
  weight: number;
  color: string;
  minSize: number;
  maxSize: number;
  preferredSize: number;
  specifications: Specification[];
};

type QualityDefinitionFormProps = {
  initialValues?: QualityDefinitionFormValues;
  onSubmit: (values: QualityDefinitionFormValues) => void;
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

export default function QualityDefinitionForm({
  initialValues,
  onSubmit,
  onCancel,
  loading,
}: QualityDefinitionFormProps): JSX.Element {
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [weight, setWeight] = useState(initialValues?.weight ?? 1);
  const [color, setColor] = useState(initialValues?.color ?? "gray");
  const [minSize, setMinSize] = useState(initialValues?.minSize ?? 0);
  const [maxSize, setMaxSize] = useState(initialValues?.maxSize ?? 0);
  const [preferredSize, setPreferredSize] = useState(
    initialValues?.preferredSize ?? 0,
  );
  const [specifications, setSpecifications] = useState<SpecEntry[]>(() =>
    toEntries(initialValues?.specifications ?? []),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    setSpecifications((prev) => {
      const next: SpecEntry[] = [];
      for (const s of prev) {
        if (s._id === id) {
          next.push({ ...updated, _id: id });
        } else {
          next.push(s);
        }
      }
      return next;
    });
  };

  const handleRemoveSpec = (id: string) => {
    setSpecifications((prev) => prev.filter((s) => s._id !== id));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const strippedSpecs = specifications.map(({ _id, ...rest }) => rest);
    const result = validateForm(createQualityDefinitionSchema, {
      title,
      weight,
      color,
      minSize,
      maxSize,
      preferredSize,
      specifications: strippedSpecs,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit({
      title,
      weight,
      color,
      minSize,
      maxSize,
      preferredSize,
      specifications: strippedSpecs,
    });
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
          <div>
            <Label className="text-xs text-muted-foreground">Preferred</Label>
            <Input
              type="number"
              value={preferredSize}
              onChange={(e) => setPreferredSize(Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Max</Label>
            <Input
              type="number"
              value={maxSize}
              onChange={(e) => setMaxSize(Number(e.target.value))}
            />
          </div>
        </div>
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
