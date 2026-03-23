import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import PageHeader from "src/components/shared/page-header";
import { metadataProfileQuery, settingsMapQuery } from "src/lib/queries";
import {
  useUpdateMetadataProfile,
  useUpdateSettings,
} from "src/hooks/mutations";
import validateForm from "src/lib/form-validation";
import { metadataProfileSchema } from "src/lib/validators";

export const Route = createFileRoute("/_authed/settings/metadata")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(metadataProfileQuery()),
      context.queryClient.ensureQueryData(settingsMapQuery()),
    ]);
  },
  component: MetadataSettingsPage,
});

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "pl", label: "Polish" },
  { value: "da", label: "Danish" },
  { value: "no", label: "Norwegian" },
  { value: "fi", label: "Finnish" },
];

const REGION_OPTIONS = [
  { value: "", label: "No filter" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "IN", label: "India" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "DK", label: "Denmark" },
  { value: "NO", label: "Norway" },
  { value: "FI", label: "Finland" },
];

function MetadataSettingsPage() {
  const { data: profile } = useSuspenseQuery(metadataProfileQuery());
  const { data: settingsMap } = useSuspenseQuery(settingsMapQuery());
  const updateProfile = useUpdateMetadataProfile();
  const updateSettings = useUpdateSettings();

  // ── Hardcover tab state ────────────────────────────────────────────────────
  const [hardcoverApiKey, setHardcoverApiKey] = useState(
    (settingsMap["metadata.hardcover.apiKey"] as string | undefined) ?? "",
  );
  const [skipMissingReleaseDate, setSkipMissingReleaseDate] = useState(
    profile.skipMissingReleaseDate,
  );
  const [skipMissingIsbnAsin, setSkipMissingIsbnAsin] = useState(
    profile.skipMissingIsbnAsin,
  );
  const [skipCompilations, setSkipCompilations] = useState(
    profile.skipCompilations,
  );
  const [minimumPopularity, setMinimumPopularity] = useState(
    profile.minimumPopularity,
  );
  const [minimumPages, setMinimumPages] = useState(profile.minimumPages);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>(
    {},
  );

  // ── TMDB tab state ─────────────────────────────────────────────────────────
  const [tmdbApiKey, setTmdbApiKey] = useState(
    (settingsMap["metadata.tmdb.apiKey"] as string | undefined) ?? "",
  );
  const [tmdbLanguage, setTmdbLanguage] = useState(
    (settingsMap["metadata.tmdb.language"] as string | undefined) ?? "en",
  );
  const [tmdbIncludeAdult, setTmdbIncludeAdult] = useState(
    (settingsMap["metadata.tmdb.includeAdult"] as boolean | undefined) ?? false,
  );
  const [tmdbRegion, setTmdbRegion] = useState(
    (settingsMap["metadata.tmdb.region"] as string | undefined) ?? "",
  );

  // ── Save handlers ──────────────────────────────────────────────────────────
  const handleSaveHardcover = () => {
    const result = validateForm(metadataProfileSchema, {
      skipMissingReleaseDate,
      skipMissingIsbnAsin,
      skipCompilations,
      minimumPopularity,
      minimumPages,
    });
    if (!result.success) {
      setProfileErrors(result.errors);
      return;
    }
    setProfileErrors({});
    // Save API key first, then profile; both fire in sequence.
    updateSettings.mutate(
      [{ key: "metadata.hardcover.apiKey", value: hardcoverApiKey }],
      { onSuccess: () => updateProfile.mutate(result.data) },
    );
  };

  const handleSaveTmdb = () => {
    updateSettings.mutate([
      { key: "metadata.tmdb.apiKey", value: tmdbApiKey },
      { key: "metadata.tmdb.language", value: tmdbLanguage },
      {
        key: "metadata.tmdb.includeAdult",
        value: String(tmdbIncludeAdult),
      },
      { key: "metadata.tmdb.region", value: tmdbRegion },
    ]);
  };

  const isHardcoverSaving = updateProfile.isPending || updateSettings.isPending;
  const isTmdbSaving = updateSettings.isPending;

  return (
    <div>
      <PageHeader
        title="Metadata Settings"
        description="Configure metadata sources and import filters."
      />

      <div className="max-w-2xl">
        <Tabs defaultValue="hardcover">
          <TabsList className="mb-6">
            <TabsTrigger value="hardcover">Hardcover</TabsTrigger>
            <TabsTrigger value="tmdb">TMDB</TabsTrigger>
          </TabsList>

          {/* ── Hardcover Tab ─────────────────────────────────────────────── */}
          <TabsContent value="hardcover" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Token</CardTitle>
                <CardDescription>
                  Override the Hardcover API token used for metadata lookups.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hardcover-api-key">API Token</Label>
                  <Input
                    id="hardcover-api-key"
                    type="password"
                    placeholder="Enter Hardcover API token"
                    value={hardcoverApiKey}
                    onChange={(e) => setHardcoverApiKey(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    If left empty, the{" "}
                    <code className="text-xs font-mono">HARDCOVER_TOKEN</code>{" "}
                    environment variable will be used.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Import Filters</CardTitle>
                <CardDescription>
                  Control which books are imported when adding authors or
                  refreshing metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Skip books with missing release date</Label>
                    <p className="text-sm text-muted-foreground">
                      Books without a release date will not be imported.
                    </p>
                  </div>
                  <Switch
                    checked={skipMissingReleaseDate}
                    onCheckedChange={setSkipMissingReleaseDate}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Skip books with no ISBN or ASIN</Label>
                    <p className="text-sm text-muted-foreground">
                      Books where no edition has an ISBN or ASIN (after language
                      filtering) will not be imported.
                    </p>
                  </div>
                  <Switch
                    checked={skipMissingIsbnAsin}
                    onCheckedChange={setSkipMissingIsbnAsin}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Skip compilations and box sets</Label>
                    <p className="text-sm text-muted-foreground">
                      Books marked as compilations on Hardcover will not be
                      imported.
                    </p>
                  </div>
                  <Switch
                    checked={skipCompilations}
                    onCheckedChange={setSkipCompilations}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minimum-popularity">Minimum Popularity</Label>
                  <p className="text-sm text-muted-foreground">
                    Books with fewer readers than this value will be skipped.
                    Set to 0 to disable.
                  </p>
                  <Input
                    id="minimum-popularity"
                    type="number"
                    min={0}
                    value={minimumPopularity}
                    onChange={(e) =>
                      setMinimumPopularity(
                        Number.parseInt(e.target.value, 10) || 0,
                      )
                    }
                    className="w-32"
                  />
                  {profileErrors.minimumPopularity && (
                    <p className="text-sm text-destructive">
                      {profileErrors.minimumPopularity}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minimum-pages">Minimum Pages</Label>
                  <p className="text-sm text-muted-foreground">
                    Books where no edition has at least this many pages will be
                    skipped. Audiobook editions are excluded from this check.
                    Set to 0 to disable.
                  </p>
                  <Input
                    id="minimum-pages"
                    type="number"
                    min={0}
                    value={minimumPages}
                    onChange={(e) =>
                      setMinimumPages(Number.parseInt(e.target.value, 10) || 0)
                    }
                    className="w-32"
                  />
                  {profileErrors.minimumPages && (
                    <p className="text-sm text-destructive">
                      {profileErrors.minimumPages}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveHardcover} disabled={isHardcoverSaving}>
              {isHardcoverSaving ? "Saving..." : "Save Hardcover Settings"}
            </Button>
          </TabsContent>

          {/* ── TMDB Tab ──────────────────────────────────────────────────── */}
          <TabsContent value="tmdb" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Key</CardTitle>
                <CardDescription>
                  Your TMDB API key for fetching movie and TV metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="tmdb-api-key">API Key</Label>
                <Input
                  id="tmdb-api-key"
                  type="password"
                  placeholder="Enter TMDB API key"
                  value={tmdbApiKey}
                  onChange={(e) => setTmdbApiKey(e.target.value)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Language & Region</CardTitle>
                <CardDescription>
                  Filter TMDB results by language and region.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="tmdb-language">Language</Label>
                  <p className="text-sm text-muted-foreground">
                    Preferred language for TMDB metadata results.
                  </p>
                  <Select value={tmdbLanguage} onValueChange={setTmdbLanguage}>
                    <SelectTrigger id="tmdb-language" className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label} ({opt.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tmdb-region">Region</Label>
                  <p className="text-sm text-muted-foreground">
                    Filter results to a specific country/region.
                  </p>
                  <Select value={tmdbRegion} onValueChange={setTmdbRegion}>
                    <SelectTrigger id="tmdb-region" className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value || "__none"}
                          value={opt.value}
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Include Adult Content</Label>
                    <p className="text-sm text-muted-foreground">
                      Include adult-rated titles in TMDB search results.
                    </p>
                  </div>
                  <Switch
                    checked={tmdbIncludeAdult}
                    onCheckedChange={setTmdbIncludeAdult}
                  />
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveTmdb} disabled={isTmdbSaving}>
              {isTmdbSaving ? "Saving..." : "Save TMDB Settings"}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
