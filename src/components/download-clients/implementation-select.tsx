import { Button } from "src/components/ui/button";

type ImplementationType =
  | "qBittorrent"
  | "Transmission"
  | "Deluge"
  | "rTorrent"
  | "SABnzbd"
  | "NZBGet"
  | "Blackhole";

type ClientOption = {
  implementation: ImplementationType;
  label: string;
  description: string;
  protocol: "torrent" | "usenet" | "both";
};

const TORRENT_CLIENTS: ClientOption[] = [
  {
    implementation: "qBittorrent",
    label: "qBittorrent",
    description: "Web API v2",
    protocol: "torrent",
  },
  {
    implementation: "Transmission",
    label: "Transmission",
    description: "JSON-RPC",
    protocol: "torrent",
  },
  {
    implementation: "Deluge",
    label: "Deluge",
    description: "Web UI API",
    protocol: "torrent",
  },
  {
    implementation: "rTorrent",
    label: "rTorrent",
    description: "XML-RPC",
    protocol: "torrent",
  },
  {
    implementation: "Blackhole",
    label: "Blackhole",
    description: "Watch folder",
    protocol: "both",
  },
];

const USENET_CLIENTS: ClientOption[] = [
  {
    implementation: "SABnzbd",
    label: "SABnzbd",
    description: "HTTP API",
    protocol: "usenet",
  },
  {
    implementation: "NZBGet",
    label: "NZBGet",
    description: "JSON-RPC",
    protocol: "usenet",
  },
];

type ImplementationSelectProps = {
  onSelect: (implementation: ImplementationType) => void;
  onCancel: () => void;
};

function ClientButton({
  option,
  onSelect,
}: {
  option: ClientOption;
  onSelect: (impl: ImplementationType) => void;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto flex-col gap-1 p-4 text-left items-start"
      onClick={() => onSelect(option.implementation)}
    >
      <span className="font-semibold text-sm">{option.label}</span>
      <span className="text-xs text-muted-foreground">
        {option.description}
      </span>
    </Button>
  );
}

export default function ImplementationSelect({
  onSelect,
  onCancel,
}: ImplementationSelectProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Torrent Clients
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TORRENT_CLIENTS.map((option) => (
            <ClientButton
              key={option.implementation}
              option={option}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Usenet Clients
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {USENET_CLIENTS.map((option) => (
            <ClientButton
              key={option.implementation}
              option={option}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
