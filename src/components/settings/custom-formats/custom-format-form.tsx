import { useState, useMemo } from "react";
import type { FormEvent, JSX } from "react";
import validateForm from "src/lib/form-validation";
import {
  createCustomFormatSchema,
  customFormatCategories,
  customFormatContentTypes,
} from "src/lib/validators";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import Checkbox from "src/components/ui/checkbox";
import Textarea from "src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import SpecificationBuilder from "src/components/settings/custom-formats/specification-builder";
import type { Spec } from "src/components/settings/custom-formats/specification-builder";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  movie: "Movie",
  tv: "TV",
  ebook: "Ebook",
  audiobook: "Audiobook",
};

type CustomFormatFormProps = {
  initialValues?: {
    id: number;
    name: string;
    category: string;
    specifications: Spec[];
    defaultScore: number;
    contentTypes: string[];
    includeInRenaming: boolean;
    description: string | null;
    enabled: boolean;
  };
  onSubmit: (values: {
    name: string;
    category: (typeof customFormatCategories)[number];
    specifications: Spec[];
    defaultScore: number;
    contentTypes: Array<(typeof customFormatContentTypes)[number]>;
    includeInRenaming: boolean;
    description: string | null;
    enabled: boolean;
  }) => void;
  onCancel: () => void;
  loading?: boolean;
  serverError?: string;
};

type Defaults = {
  name: string;
  category: string;
  specifications: Spec[];
  defaultScore: number;
  contentTypes: string[];
  includeInRenaming: boolean;
  description: string;
  enabled: boolean;
};

const FORM_DEFAULTS: Defaults = {
  name: "",
  category: "Unwanted",
  specifications: [],
  defaultScore: 0,
  contentTypes: ["ebook"],
  includeInRenaming: false,
  description: "",
  enabled: true,
};

function getDefaults(
  initialValues: CustomFormatFormProps["initialValues"],
): Defaults {
  if (!initialValues) {
    return FORM_DEFAULTS;
  }
  return {
    name: initialValues.name,
    category: initialValues.category,
    specifications: initialValues.specifications,
    defaultScore: initialValues.defaultScore,
    contentTypes: initialValues.contentTypes,
    includeInRenaming: initialValues.includeInRenaming,
    description: initialValues.description ?? "",
    enabled: initialValues.enabled,
  };
}

export default function CustomFormatForm({
  initialValues,
  onSubmit,
  onCancel,
  loading,
  serverError,
}: CustomFormatFormProps): JSX.Element {
  const defaults = useMemo(() => getDefaults(initialValues), [initialValues]);

  const [name, setName] = useState(defaults.name);
  const [category, setCategory] = useState(defaults.category);
  const [specifications, setSpecifications] = useState<Spec[]>(
    defaults.specifications,
  );
  const [defaultScore, setDefaultScore] = useState(defaults.defaultScore);
  const [contentTypes, setContentTypes] = useState<string[]>(
    defaults.contentTypes,
  );
  const [includeInRenaming, setIncludeInRenaming] = useState(
    defaults.includeInRenaming,
  );
  const [description, setDescription] = useState(defaults.description);
  const [enabled, setEnabled] = useState(defaults.enabled);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleContentTypeToggle = (ct: string, checked: boolean) => {
    if (checked) {
      setContentTypes((prev) => [...prev, ct]);
    } else {
      setContentTypes((prev) => prev.filter((t) => t !== ct));
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = validateForm(createCustomFormatSchema, {
      name,
      category,
      specifications,
      defaultScore,
      contentTypes,
      includeInRenaming,
      description: description || null,
      enabled,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="cf-name">Name</Label>
        <Input
          id="cf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Custom format name"
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name}</p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="cf-category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="cf-category" className="w-full">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {customFormatCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.category && (
          <p className="text-sm text-destructive">{errors.category}</p>
        )}
      </div>

      {/* Content Types */}
      <div className="space-y-2">
        <Label>Content Types</Label>
        <div className="flex flex-wrap gap-4">
          {customFormatContentTypes.map((ct) => (
            <div key={ct} className="flex items-center gap-2">
              <Checkbox
                id={`cf-ct-${ct}`}
                checked={contentTypes.includes(ct)}
                onCheckedChange={(checked) =>
                  handleContentTypeToggle(ct, checked === true)
                }
              />
              <Label htmlFor={`cf-ct-${ct}`} className="text-sm font-normal">
                {CONTENT_TYPE_LABELS[ct] ?? ct}
              </Label>
            </div>
          ))}
        </div>
        {errors.contentTypes && (
          <p className="text-sm text-destructive">{errors.contentTypes}</p>
        )}
      </div>

      {/* Default Score */}
      <div className="space-y-2">
        <Label htmlFor="cf-score">Default Score</Label>
        <Input
          id="cf-score"
          type="number"
          value={defaultScore}
          onChange={(e) => setDefaultScore(Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          +1500 to +2500 strongly prefer, +500 to +1499 prefer, +1 to +499
          slight preference, 0 neutral, negative penalize, -10000 block
        </p>
        {errors.defaultScore && (
          <p className="text-sm text-destructive">{errors.defaultScore}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="cf-description">Description</Label>
        <Textarea
          id="cf-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          className="min-h-[60px]"
        />
      </div>

      {/* Include in Renaming */}
      <div className="flex items-center gap-2">
        <Switch
          id="cf-include-renaming"
          checked={includeInRenaming}
          onCheckedChange={setIncludeInRenaming}
        />
        <Label htmlFor="cf-include-renaming">Include in Renaming</Label>
      </div>

      {/* Enabled */}
      <div className="flex items-center gap-2">
        <Switch
          id="cf-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="cf-enabled">Enabled</Label>
      </div>

      {/* Specifications */}
      <SpecificationBuilder
        value={specifications}
        onChange={setSpecifications}
      />
      {errors.specifications && (
        <p className="text-sm text-destructive">{errors.specifications}</p>
      )}

      {/* Server Error */}
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      {/* Actions */}
      <div className="flex justify-end gap-2">
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
