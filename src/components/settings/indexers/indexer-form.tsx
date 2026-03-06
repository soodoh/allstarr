import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import CategoryMultiSelect from "src/components/shared/category-multi-select";
import validateForm from "src/lib/form-validation";
import { createIndexerSchema } from "src/lib/validators";
import { testIndexerFn } from "src/server/indexers";

export type IndexerFormValues = {
  name: string;
  implementation: "Newznab" | "Torznab";
  protocol: "usenet" | "torrent";
  baseUrl: string;
  apiPath: string;
  apiKey: string;
  categories: number[];
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  priority: number;
  tag: string;
  downloadClientId: number | null;
};

type TestResult = {
  success: boolean;
  message: string;
  version: string | null;
};

type DownloadClient = {
  id: number;
  name: string;
  protocol: string;
};

type IndexerFormProps = {
  implementation: "Newznab" | "Torznab";
  protocol: "usenet" | "torrent";
  initialValues?: Partial<IndexerFormValues>;
  downloadClients?: DownloadClient[];
  onSubmit: (values: IndexerFormValues) => void;
  onCancel: () => void;
  cancelLabel?: string;
  loading?: boolean;
};

function TestResultBanner({ result }: { result: TestResult }): JSX.Element {
  const isSuccess = result.success;
  return (
    <div
      className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
        isSuccess
          ? "border-green-500/30 bg-green-500/10 text-green-400"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
      )}
      <div>
        <p>{result.message}</p>
        {result.version && (
          <p className="text-xs opacity-70 mt-0.5">Version: {result.version}</p>
        )}
      </div>
    </div>
  );
}

// oxlint-disable-next-line complexity -- Form component with many state fields and async handlers
export default function IndexerForm({
  implementation,
  protocol,
  initialValues,
  downloadClients = [],
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
  loading,
}: IndexerFormProps): JSX.Element {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [enableRss, setEnableRss] = useState(initialValues?.enableRss ?? true);
  const [enableAutomaticSearch, setEnableAutomaticSearch] = useState(
    initialValues?.enableAutomaticSearch ?? true,
  );
  const [enableInteractiveSearch, setEnableInteractiveSearch] = useState(
    initialValues?.enableInteractiveSearch ?? true,
  );
  const [baseUrl, setBaseUrl] = useState(initialValues?.baseUrl ?? "");
  const [apiPath, setApiPath] = useState(initialValues?.apiPath ?? "/api");
  const [apiKey, setApiKey] = useState(initialValues?.apiKey ?? "");
  const [priority, setPriority] = useState(initialValues?.priority ?? 25);
  const [categories, setCategories] = useState<number[]>(
    initialValues?.categories ?? [],
  );
  const [tag, setTag] = useState(initialValues?.tag ?? "");
  const [downloadClientId, setDownloadClientId] = useState<number | null>(
    initialValues?.downloadClientId ?? null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredClients = downloadClients.filter(
    (c) => c.protocol === protocol,
  );

  const testMutation = useMutation({
    mutationFn: () =>
      testIndexerFn({
        data: {
          baseUrl,
          apiPath,
          apiKey,
        },
      }),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = validateForm(createIndexerSchema, {
      name,
      implementation,
      protocol,
      baseUrl,
      apiPath,
      apiKey,
      categories,
      enableRss,
      enableAutomaticSearch,
      enableInteractiveSearch,
      priority,
      tag: tag || null,
      downloadClientId,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit({
      name,
      implementation,
      protocol,
      baseUrl,
      apiPath,
      apiKey,
      categories,
      enableRss,
      enableAutomaticSearch,
      enableInteractiveSearch,
      priority,
      tag,
      downloadClientId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="ix-name">Name</Label>
        <Input
          id="ix-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Indexer"
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name}</p>
        )}
      </div>

      {/* RSS / Search toggles */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="ix-rss"
            checked={enableRss}
            onCheckedChange={setEnableRss}
          />
          <Label htmlFor="ix-rss">RSS</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="ix-auto-search"
            checked={enableAutomaticSearch}
            onCheckedChange={setEnableAutomaticSearch}
          />
          <Label htmlFor="ix-auto-search">Automatic Search</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="ix-interactive-search"
            checked={enableInteractiveSearch}
            onCheckedChange={setEnableInteractiveSearch}
          />
          <Label htmlFor="ix-interactive-search">Interactive Search</Label>
        </div>
      </div>

      {/* Base URL */}
      <div className="space-y-2">
        <Label htmlFor="ix-baseurl">Base URL</Label>
        <Input
          id="ix-baseurl"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://indexer.example.com"
        />
        {errors.baseUrl && (
          <p className="text-sm text-destructive">{errors.baseUrl}</p>
        )}
      </div>

      {/* API Path */}
      <div className="space-y-2">
        <Label htmlFor="ix-apipath">
          API Path{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="ix-apipath"
          value={apiPath}
          onChange={(e) => setApiPath(e.target.value)}
          placeholder="/api"
        />
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <Label htmlFor="ix-apikey">API Key</Label>
        <Input
          id="ix-apikey"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        {errors.apiKey && (
          <p className="text-sm text-destructive">{errors.apiKey}</p>
        )}
      </div>

      {/* Priority */}
      <div className="space-y-2 w-24">
        <Label htmlFor="ix-priority">Priority</Label>
        <Input
          id="ix-priority"
          type="number"
          min={1}
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
        />
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <Label>Categories</Label>
        <CategoryMultiSelect value={categories} onChange={setCategories} />
      </div>

      {/* Tag */}
      <div className="space-y-2">
        <Label htmlFor="ix-tag">
          Tag <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="ix-tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder=""
        />
        <p className="text-xs text-muted-foreground">
          Categories and tags can also be set on the{" "}
          <a
            href="/settings/download-clients"
            className="text-primary underline underline-offset-2"
          >
            download client
          </a>
        </p>
      </div>

      {/* Download Client */}
      {filteredClients.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="ix-download-client">
            Download Client{" "}
            <span className="text-muted-foreground text-xs">(override)</span>
          </Label>
          <Select
            value={downloadClientId?.toString() ?? "none"}
            onValueChange={(v) =>
              setDownloadClientId(v === "none" ? null : Number(v))
            }
          >
            <SelectTrigger id="ix-download-client" className="w-full">
              <SelectValue>
                {filteredClients.find((c) => c.id === downloadClientId)?.name ??
                  "(Any)"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(Any)</SelectItem>
              {filteredClients.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Test connection */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !apiKey || !baseUrl}
        >
          {testMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Test Connection
        </Button>
        {testMutation.data && <TestResultBanner result={testMutation.data} />}
        {testMutation.error && (
          <TestResultBanner
            result={{
              success: false,
              message:
                testMutation.error instanceof Error
                  ? testMutation.error.message
                  : "Unknown error occurred",
              version: null,
            }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
