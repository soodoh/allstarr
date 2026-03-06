import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Switch from "src/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import PageHeader from "src/components/shared/page-header";
import LanguageMultiSelect from "src/components/shared/language-multi-select";
import { metadataProfileQuery } from "src/lib/queries";
import { useUpdateMetadataProfile } from "src/hooks/mutations";
import validateForm from "src/lib/form-validation";
import { metadataProfileSchema } from "src/lib/validators";

export const Route = createFileRoute("/_authed/settings/metadata")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(metadataProfileQuery()),
  component: MetadataSettingsPage,
});

function MetadataSettingsPage() {
  const { data: profile } = useSuspenseQuery(metadataProfileQuery());
  const updateProfile = useUpdateMetadataProfile();

  const [allowedLanguages, setAllowedLanguages] = useState(
    profile.allowedLanguages,
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = validateForm(metadataProfileSchema, {
      allowedLanguages,
      skipMissingReleaseDate,
      skipMissingIsbnAsin,
      skipCompilations,
      minimumPopularity,
      minimumPages,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    updateProfile.mutate(result.data);
  };

  return (
    <div>
      <PageHeader
        title="Metadata Profile"
        description="Configure import filters and language preferences."
      />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Allowed Languages</CardTitle>
            <CardDescription>
              Only editions in these languages will be imported from Hardcover.
              At least one language must be selected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageMultiSelect
              value={allowedLanguages}
              onChange={setAllowedLanguages}
            />
            {errors.allowedLanguages && (
              <p className="text-sm text-destructive mt-2">
                {errors.allowedLanguages}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import Filters</CardTitle>
            <CardDescription>
              Control which books are imported when adding authors or refreshing
              metadata.
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
              <Label>Minimum Popularity</Label>
              <p className="text-sm text-muted-foreground">
                Books with fewer readers than this value will be skipped. Set to
                0 to disable.
              </p>
              <Input
                type="number"
                min={0}
                value={minimumPopularity}
                onChange={(e) =>
                  setMinimumPopularity(Number.parseInt(e.target.value, 10) || 0)
                }
                className="w-32"
              />
            </div>

            <div className="space-y-2">
              <Label>Minimum Pages</Label>
              <p className="text-sm text-muted-foreground">
                Books where no edition has at least this many pages will be
                skipped. Audiobook editions are excluded from this check. Set to
                0 to disable.
              </p>
              <Input
                type="number"
                min={0}
                value={minimumPages}
                onChange={(e) =>
                  setMinimumPages(Number.parseInt(e.target.value, 10) || 0)
                }
                className="w-32"
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}
