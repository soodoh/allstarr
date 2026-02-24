import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import Input from "~/components/ui/input";
import Label from "~/components/ui/label";
import Switch from "~/components/ui/switch";
import { testDownloadClientFn } from "~/server/download-clients";

type ImplementationType =
  | "qBittorrent"
  | "Transmission"
  | "Deluge"
  | "rTorrent"
  | "SABnzbd"
  | "NZBGet"
  | "Blackhole";

type ClientConfigEntry = {
  protocol: "torrent" | "usenet";
  defaultPort: number;
  fields: {
    username: boolean;
    password: boolean;
    apiKey: boolean;
    watchFolder: boolean;
  };
  hideHostPort?: boolean;
};

const CLIENT_CONFIGS: Record<ImplementationType, ClientConfigEntry> = {
  qBittorrent: {
    protocol: "torrent",
    defaultPort: 8080,
    fields: { username: true, password: true, apiKey: false, watchFolder: false },
  },
  Transmission: {
    protocol: "torrent",
    defaultPort: 9091,
    fields: { username: true, password: true, apiKey: false, watchFolder: false },
  },
  Deluge: {
    protocol: "torrent",
    defaultPort: 8112,
    fields: {
      username: false,
      password: true,
      apiKey: false,
      watchFolder: false,
    },
  },
  rTorrent: {
    protocol: "torrent",
    defaultPort: 8080,
    fields: { username: true, password: true, apiKey: false, watchFolder: false },
  },
  SABnzbd: {
    protocol: "usenet",
    defaultPort: 8080,
    fields: {
      username: false,
      password: false,
      apiKey: true,
      watchFolder: false,
    },
  },
  NZBGet: {
    protocol: "usenet",
    defaultPort: 6789,
    fields: { username: true, password: true, apiKey: false, watchFolder: false },
  },
  Blackhole: {
    protocol: "torrent",
    defaultPort: 0,
    fields: {
      username: false,
      password: false,
      apiKey: false,
      watchFolder: true,
    },
    hideHostPort: true,
  },
};

export type DownloadClientFormValues = {
  name: string;
  implementation: ImplementationType;
  protocol: "torrent" | "usenet";
  enabled: boolean;
  priority: number;
  host: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  username: string;
  password: string;
  apiKey: string;
  category: string;
  watchFolder: string;
};

type TestResult = {
  success: boolean;
  message: string;
  version?: string;
};

type DownloadClientFormProps = {
  initialValues?: Partial<DownloadClientFormValues> & {
    implementation: ImplementationType;
  };
  onSubmit: (values: DownloadClientFormValues) => void;
  onCancel: () => void;
  cancelLabel?: string;
  loading?: boolean;
};

// ─── Sub-components to keep main function complexity down ────────────────────

type ConnectionFieldsProps = {
  host: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  onHost: (v: string) => void;
  onPort: (v: number) => void;
  onSsl: (v: boolean) => void;
  onUrlBase: (v: string) => void;
};

function ConnectionFields({
  host,
  port,
  useSsl,
  urlBase,
  onHost,
  onPort,
  onSsl,
  onUrlBase,
}: ConnectionFieldsProps): React.JSX.Element {
  return (
    <>
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div className="space-y-2">
          <Label htmlFor="dc-host">Host</Label>
          <Input
            id="dc-host"
            value={host}
            onChange={(e) => onHost(e.target.value)}
            placeholder="localhost"
            required
          />
        </div>
        <div className="space-y-2 w-24">
          <Label htmlFor="dc-port">Port</Label>
          <Input
            id="dc-port"
            type="number"
            min={1}
            max={65_535}
            value={port}
            onChange={(e) => onPort(Number(e.target.value))}
            required
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="dc-ssl" checked={useSsl} onCheckedChange={onSsl} />
          <Label htmlFor="dc-ssl">SSL</Label>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dc-urlbase">
          URL Base{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="dc-urlbase"
          value={urlBase}
          onChange={(e) => onUrlBase(e.target.value)}
          placeholder="/qbittorrent"
        />
      </div>
    </>
  );
}

function TestResultBanner({ result }: { result: TestResult }): React.JSX.Element {
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

type CredentialFieldsProps = {
  fields: ClientConfigEntry["fields"];
  username: string;
  password: string;
  apiKey: string;
  watchFolder: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onApiKey: (v: string) => void;
  onWatchFolder: (v: string) => void;
};

function CredentialFields({
  fields,
  username,
  password,
  apiKey,
  watchFolder,
  onUsername,
  onPassword,
  onApiKey,
  onWatchFolder,
}: CredentialFieldsProps): React.JSX.Element {
  return (
    <>
      {fields.watchFolder && (
        <div className="space-y-2">
          <Label htmlFor="dc-watchfolder">Watch Folder</Label>
          <Input
            id="dc-watchfolder"
            value={watchFolder}
            onChange={(e) => onWatchFolder(e.target.value)}
            placeholder="/data/blackhole"
            required
          />
        </div>
      )}
      {fields.username && (
        <div className="space-y-2">
          <Label htmlFor="dc-username">Username</Label>
          <Input
            id="dc-username"
            value={username}
            onChange={(e) => onUsername(e.target.value)}
            autoComplete="off"
          />
        </div>
      )}
      {fields.password && (
        <div className="space-y-2">
          <Label htmlFor="dc-password">Password</Label>
          <Input
            id="dc-password"
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      )}
      {fields.apiKey && (
        <div className="space-y-2">
          <Label htmlFor="dc-apikey">API Key</Label>
          <Input
            id="dc-apikey"
            value={apiKey}
            onChange={(e) => onApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>
      )}
    </>
  );
}

// ─── Main form ───────────────────────────────────────────────────────────────

// oxlint-disable-next-line complexity -- Form component with many conditional fields driven by client config
export default function DownloadClientForm({
  initialValues,
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
  loading,
}: DownloadClientFormProps): React.JSX.Element {
  const impl = initialValues?.implementation ?? "qBittorrent";
  const clientConfig = CLIENT_CONFIGS[impl];

  const [name, setName] = useState(initialValues?.name ?? "");
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [host, setHost] = useState(initialValues?.host ?? "localhost");
  const [port, setPort] = useState(initialValues?.port ?? clientConfig.defaultPort);
  const [useSsl, setUseSsl] = useState(initialValues?.useSsl ?? false);
  const [urlBase, setUrlBase] = useState(initialValues?.urlBase ?? "");
  const [username, setUsername] = useState(initialValues?.username ?? "");
  const [password, setPassword] = useState(initialValues?.password ?? "");
  const [apiKey, setApiKey] = useState(initialValues?.apiKey ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? "allstarr");
  const [watchFolder, setWatchFolder] = useState(initialValues?.watchFolder ?? "");
  const [priority, setPriority] = useState(initialValues?.priority ?? 1);

  const testMutation = useMutation({
    mutationFn: () =>
      testDownloadClientFn({
        data: {
          implementation: impl,
          host: hideHostPort ? "localhost" : host,
          port: hideHostPort ? 1 : port,
          useSsl,
          urlBase: urlBase || undefined,
          username: username || undefined,
          password: password || undefined,
          apiKey: apiKey || undefined,
          ...(impl === "Blackhole" ? { settings: { watchFolder } } : {}),
        },
      }),
  });

  const { fields, hideHostPort } = clientConfig;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      implementation: impl,
      protocol: clientConfig.protocol,
      enabled,
      priority,
      host: hideHostPort ? "localhost" : host,
      port: hideHostPort ? 0 : port,
      useSsl,
      urlBase,
      username,
      password,
      apiKey,
      category,
      watchFolder,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name + Enable */}
      <div className="flex items-end gap-4">
        <div className="flex-1 space-y-2">
          <Label htmlFor="dc-name">Name</Label>
          <Input
            id="dc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`My ${impl}`}
            required
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="dc-enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="dc-enabled">Enabled</Label>
        </div>
      </div>

      {/* Host / Port / SSL / URL Base */}
      {!hideHostPort && (
        <ConnectionFields
          host={host}
          port={port}
          useSsl={useSsl}
          urlBase={urlBase}
          onHost={setHost}
          onPort={setPort}
          onSsl={setUseSsl}
          onUrlBase={setUrlBase}
        />
      )}

      {/* Watch folder + credentials */}
      <CredentialFields
        fields={fields}
        username={username}
        password={password}
        apiKey={apiKey}
        watchFolder={watchFolder}
        onUsername={setUsername}
        onPassword={setPassword}
        onApiKey={setApiKey}
        onWatchFolder={setWatchFolder}
      />

      {/* Category + Priority */}
      {!fields.watchFolder && (
        <div className="space-y-2">
          <Label htmlFor="dc-category">Category</Label>
          <Input
            id="dc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="allstarr"
          />
        </div>
      )}
      <div className="space-y-2 w-24">
        <Label htmlFor="dc-priority">Priority</Label>
        <Input
          id="dc-priority"
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
          disabled={testMutation.isPending}
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
