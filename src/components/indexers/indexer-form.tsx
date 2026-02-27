import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import { testIndexerFn } from "src/server/indexers";

export type IndexerFormValues = {
  name: string;
  enabled: boolean;
  priority: number;
  host: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  apiKey: string;
};

type TestResult = {
  success: boolean;
  message: string;
  version: string | null;
};

type IndexerFormProps = {
  initialValues?: Partial<IndexerFormValues>;
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
  initialValues,
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
  loading,
}: IndexerFormProps): JSX.Element {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [host, setHost] = useState(initialValues?.host ?? "localhost");
  const [port, setPort] = useState(initialValues?.port ?? 9696);
  const [useSsl, setUseSsl] = useState(initialValues?.useSsl ?? false);
  const [urlBase, setUrlBase] = useState(initialValues?.urlBase ?? "");
  const [apiKey, setApiKey] = useState(initialValues?.apiKey ?? "");
  const [priority, setPriority] = useState(initialValues?.priority ?? 25);

  const testMutation = useMutation({
    mutationFn: () =>
      testIndexerFn({
        data: {
          host,
          port,
          useSsl,
          urlBase: urlBase || null,
          apiKey,
        },
      }),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ name, enabled, host, port, useSsl, urlBase, apiKey, priority });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name + Enable */}
      <div className="flex items-end gap-4">
        <div className="flex-1 space-y-2">
          <Label htmlFor="ix-name">Name</Label>
          <Input
            id="ix-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Prowlarr"
            required
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="ix-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor="ix-enabled">Enabled</Label>
        </div>
      </div>

      {/* Host / Port / SSL */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div className="space-y-2">
          <Label htmlFor="ix-host">Host</Label>
          <Input
            id="ix-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="localhost"
            required
          />
        </div>
        <div className="space-y-2 w-24">
          <Label htmlFor="ix-port">Port</Label>
          <Input
            id="ix-port"
            type="number"
            min={1}
            max={65_535}
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            required
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="ix-ssl" checked={useSsl} onCheckedChange={setUseSsl} />
          <Label htmlFor="ix-ssl">SSL</Label>
        </div>
      </div>

      {/* URL Base */}
      <div className="space-y-2">
        <Label htmlFor="ix-urlbase">
          URL Base{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="ix-urlbase"
          value={urlBase}
          onChange={(e) => setUrlBase(e.target.value)}
          placeholder="/prowlarr"
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
          required
        />
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

      {/* Test connection */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !apiKey}
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
