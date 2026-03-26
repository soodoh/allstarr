import { useMemo } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "src/components/ui/badge";
import Label from "src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { getTmdbEpisodeGroupsFn } from "src/server/tmdb/shows";
import { EPISODE_GROUP_TYPES } from "src/server/tmdb/types";
import type {
  TmdbEpisodeGroupSummary,
  EpisodeGroupType,
} from "src/server/tmdb/types";

const TMDB_DEFAULT_VALUE = "__default__";

export function isAnime(originCountry: string[], genreIds: number[]): boolean {
  return originCountry.includes("JP") && genreIds.includes(16);
}

const ANIME_RECOMMENDED_TYPES: EpisodeGroupType[] = [6, 1, 7];

function getRecommendedGroup(
  groups: TmdbEpisodeGroupSummary[],
  anime: boolean,
): string | null {
  if (!anime) {
    return null; // TMDB Default is recommended for non-anime
  }
  for (const preferredType of ANIME_RECOMMENDED_TYPES) {
    const candidates = groups
      .filter((g) => g.type === preferredType)
      .toSorted((a, b) => b.episode_count - a.episode_count);
    if (candidates.length > 0) {
      return candidates[0].id;
    }
  }
  return null;
}

type EpisodeGroupSelectorProps = {
  tmdbId: number;
  originCountry: string[];
  genreIds: number[];
  value: string | null;
  onChange: (groupId: string | null) => void;
  /** Override anime detection heuristic (e.g. when editing an existing show with known seriesType) */
  isAnimeOverride?: boolean;
};

export default function EpisodeGroupSelector({
  tmdbId,
  originCountry,
  genreIds,
  value,
  onChange,
  isAnimeOverride,
}: EpisodeGroupSelectorProps): JSX.Element | null {
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["tmdb", "episode-groups", tmdbId],
    queryFn: () => getTmdbEpisodeGroupsFn({ data: { tmdbId } }),
    enabled: tmdbId > 0,
  });

  const anime = useMemo(
    () =>
      isAnimeOverride === undefined
        ? isAnime(originCountry, genreIds)
        : isAnimeOverride,
    [isAnimeOverride, originCountry, genreIds],
  );

  const recommendedId = useMemo(
    () => getRecommendedGroup(groups, anime),
    [groups, anime],
  );

  if (isLoading || groups.length === 0) {
    return null;
  }

  const isDefaultRecommended = !anime || recommendedId === null;

  return (
    <div className="space-y-2">
      <Label>Episode Ordering</Label>
      <Select
        value={value ?? TMDB_DEFAULT_VALUE}
        onValueChange={(v) => onChange(v === TMDB_DEFAULT_VALUE ? null : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TMDB_DEFAULT_VALUE}>
            <span className="flex items-center gap-2">
              TMDB Default
              {isDefaultRecommended && (
                <Badge variant="secondary" className="text-xs">
                  Recommended
                </Badge>
              )}
            </span>
          </SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              <span className="flex items-center gap-2">
                {group.name}
                <Badge variant="outline" className="text-xs">
                  {EPISODE_GROUP_TYPES[group.type]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {group.group_count} seasons, {group.episode_count} eps
                </span>
                {group.id === recommendedId && (
                  <Badge variant="secondary" className="text-xs">
                    Recommended
                  </Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
