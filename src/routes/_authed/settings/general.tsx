import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import PageHeader from "src/components/shared/page-header";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import { useRegenerateApiKey, useUpdateSettings } from "src/hooks/mutations";
import { settingsMapQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/settings/general")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(settingsMapQuery()),
	component: GeneralSettingsPage,
});

function ApiKeyCard({
	apiKey,
	onRegenerateClick,
	isRegenerating,
}: {
	apiKey: string;
	onRegenerateClick: () => void;
	isRegenerating: boolean;
}) {
	const handleCopy = async () => {
		await navigator.clipboard.writeText(apiKey);
		toast.success("API key copied to clipboard");
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>API Key</CardTitle>
				<CardDescription>
					Use this key to authenticate external applications (e.g. Prowlarr)
					with Allstarr.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label>API Key</Label>
					<div className="flex gap-2">
						<Input value={apiKey} readOnly className="font-mono text-sm" />
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={handleCopy}
							title="Copy API key"
						>
							<Copy className="h-4 w-4" />
						</Button>
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					onClick={onRegenerateClick}
					disabled={isRegenerating}
				>
					<RefreshCw className="mr-2 h-4 w-4" />
					{isRegenerating ? "Regenerating..." : "Regenerate API Key"}
				</Button>
			</CardContent>
		</Card>
	);
}

function GeneralSettingsPage() {
	const { data: settings } = useSuspenseQuery(settingsMapQuery());
	const updateSettings = useUpdateSettings();
	const regenerateApiKey = useRegenerateApiKey();

	const [logLevel, setLogLevel] = useState(
		(settings["general.logLevel"] as string) || "info",
	);
	const [apiKey, setApiKey] = useState(
		(settings["general.apiKey"] as string | undefined) ?? "",
	);
	const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);

	const handleSave = () => {
		updateSettings.mutate([{ key: "general.logLevel", value: logLevel }]);
	};

	return (
		<div>
			<PageHeader title="General Settings" />

			<div className="space-y-6 max-w-2xl">
				<Card>
					<CardHeader>
						<CardTitle>Logging</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<Label>Log Level</Label>
							<Select value={logLevel} onValueChange={setLogLevel}>
								<SelectTrigger className="w-48">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="trace">Trace</SelectItem>
									<SelectItem value="debug">Debug</SelectItem>
									<SelectItem value="info">Info</SelectItem>
									<SelectItem value="warn">Warn</SelectItem>
									<SelectItem value="error">Error</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</CardContent>
				</Card>

				<ApiKeyCard
					apiKey={apiKey}
					onRegenerateClick={() => setConfirmRegenerateOpen(true)}
					isRegenerating={regenerateApiKey.isPending}
				/>

				<Button onClick={handleSave} disabled={updateSettings.isPending}>
					{updateSettings.isPending ? "Saving..." : "Save Settings"}
				</Button>
			</div>

			<ConfirmDialog
				open={confirmRegenerateOpen}
				onOpenChange={setConfirmRegenerateOpen}
				title="Regenerate API Key?"
				description="Generating a new API key will invalidate the current key. Any applications using the existing key (such as Prowlarr) will need to be updated. Are you sure?"
				variant="destructive"
				onConfirm={() => {
					regenerateApiKey.mutate(undefined, {
						onSuccess: (data) => setApiKey(data.apiKey),
					});
				}}
			/>
		</div>
	);
}
