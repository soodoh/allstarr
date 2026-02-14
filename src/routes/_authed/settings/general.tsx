import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
import { PageHeader } from "~/components/shared/page-header";
import { getSettingsFn, updateSettingFn } from "~/server/settings";

export const Route = createFileRoute("/_authed/settings/general")({
  loader: () => getSettingsFn(),
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const settings = Route.useLoaderData();
  const router = useRouter();
  const [logLevel, setLogLevel] = useState(
    (settings["general.logLevel"] as string) || "info"
  );
  const [authorFolder, setAuthorFolder] = useState(
    (settings["naming.authorFolder"] as string) || "{Author Name}"
  );
  const [bookFolder, setBookFolder] = useState(
    (settings["naming.bookFolder"] as string) ||
      "{Book Title} ({Release Year})"
  );
  const [bookFile, setBookFile] = useState(
    (settings["naming.bookFile"] as string) ||
      "{Author Name} - {Book Title}"
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updateSettingFn({ data: { key: "general.logLevel", value: logLevel } }),
        updateSettingFn({
          data: { key: "naming.authorFolder", value: authorFolder },
        }),
        updateSettingFn({
          data: { key: "naming.bookFolder", value: bookFolder },
        }),
        updateSettingFn({
          data: { key: "naming.bookFile", value: bookFile },
        }),
      ]);
      toast.success("Settings saved");
      router.invalidate();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
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

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
