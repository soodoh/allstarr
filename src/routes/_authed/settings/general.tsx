import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import Input from "~/components/ui/input";
import Label from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import PageHeader from "~/components/shared/page-header";
import { settingsMapQuery } from "~/lib/queries";
import { useUpdateSettings } from "~/hooks/mutations";

export const Route = createFileRoute("/_authed/settings/general")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(settingsMapQuery()),
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const { data: settings } = useSuspenseQuery(settingsMapQuery());
  const updateSettings = useUpdateSettings();

  const [logLevel, setLogLevel] = useState(
    (settings["general.logLevel"] as string) || "info",
  );
  const [authorFolder, setAuthorFolder] = useState(
    (settings["naming.authorFolder"] as string) || "{Author Name}",
  );
  const [bookFolder, setBookFolder] = useState(
    (settings["naming.bookFolder"] as string) ||
      "{Book Title} ({Release Year})",
  );
  const [bookFile, setBookFile] = useState(
    (settings["naming.bookFile"] as string) || "{Author Name} - {Book Title}",
  );

  const handleSave = () => {
    updateSettings.mutate([
      { key: "general.logLevel", value: logLevel },
      { key: "naming.authorFolder", value: authorFolder },
      { key: "naming.bookFolder", value: bookFolder },
      { key: "naming.bookFile", value: bookFile },
    ]);
  };

  return (
    <div>
      <PageHeader title="General Settings" />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Naming</CardTitle>
            <CardDescription>
              Configure how files and folders are named
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Author Folder Format</Label>
              <Input
                value={authorFolder}
                onChange={(e) => setAuthorFolder(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Book Folder Format</Label>
              <Input
                value={bookFolder}
                onChange={(e) => setBookFolder(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Book File Format</Label>
              <Input
                value={bookFile}
                onChange={(e) => setBookFile(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

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

        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
