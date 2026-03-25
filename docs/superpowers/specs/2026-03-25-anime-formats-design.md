# Anime Custom Formats & Download Profile

Add all TRaSH Guides anime custom formats and an "Anime 1080p" TV download profile, matching Recyclarr's recommendations.

## Source of Truth

TRaSH Guides Sonarr anime quality profile: the `[Anime] Remux-1080p` configuration. All custom format names, specifications, and scores come directly from TRaSH's JSON definitions at `https://github.com/TRaSH-Guides/Guides/tree/master/docs/json/sonarr/cf/`.

## Custom Formats (39 total)

All custom formats have `contentTypes: ["tv"]` and `origin: "builtin"`.

### Anime BD Tiers (8 formats)

Release group tiers for Bluray/Remux/DVD sources. Each format has:

- `videoSource` specs for Bluray, BlurayRaw (Remux), DVD — all `required: false`
- `releaseTitle` regex specs for group names — all `required: false`
- OR logic: any single spec match triggers the format

| Name             | Score | Key Groups (partial)                                                                                                                    |
| ---------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Anime BD Tier 01 | 1400  | DemiHuman, FLE, Flugel, LYS1TH3A, Moxie, NAN0, sam, smol, SoM, ZR                                                                       |
| Anime BD Tier 02 | 1300  | Aergia, Arg0, Arid, FateSucks, hydes, JOHNTiTOR, JySzE, koala, Kulot, LostYears, Lulu, Meakes, Orphan, PMR, Vodes, WAP, YURI, ZeroBuild |
| Anime BD Tier 03 | 1200  | ARC, BBT-RMX, cappybara, ChucksMux, CRUCiBLE, Doc, fig, Legion, Mysteria, ~31 groups                                                    |
| Anime BD Tier 04 | 1100  | Afro, Chimera, Kametsu, Metal, Virtuality, ~40 groups                                                                                   |
| Anime BD Tier 05 | 1000  | Animorphs, AOmundson, ASC, Baws, Beatrice, B00BA, ~30 groups                                                                            |
| Anime BD Tier 06 | 900   | ANE, Bunny-Apocalypse, CyC, EJF, iKaos, Tsundere, YURASUKA, ~18 groups                                                                  |
| Anime BD Tier 07 | 800   | 9volt, AC, Almighty, Asakura, Asenshi, Chihiro, Commie, GJM, THORA, ~37 groups                                                          |
| Anime BD Tier 08 | 700   | AkihitoSubs, Arukoru, EDGE, EMBER, GHOST, Judas, naiyas, Prof, ~13 groups                                                               |

### Anime Web Tiers (6 formats)

Release group tiers for Web/WEBDL/WEBRip sources. Same structure as BD tiers but with web source specs.

| Name              | Score | Key Groups (partial)                                            |
| ----------------- | ----- | --------------------------------------------------------------- |
| Anime Web Tier 01 | 600   | Arid, FLE, LostYears, Setsugen, Vodes, ZeroBuild, ~15 groups    |
| Anime Web Tier 02 | 500   | 0x539, Cyan, Cytox, Dae, Foxtrot, Gao, MTBB, Tenshi, ~22 groups |
| Anime Web Tier 03 | 400   | AnoZu, Dooky, Kitsune, SubsPlus+, ZR                            |
| Anime Web Tier 04 | 300   | Erai-raws, ToonsHub, VARYG                                      |
| Anime Web Tier 05 | 200   | SubsPlease, HorribleSubs, ~16 groups                            |
| Anime Web Tier 06 | 100   | 9volt, Asenshi, Chihiro, Commie, DameDesuYo, GJM, ~14 groups    |

### Remux Tiers (2 formats)

| Name          | Score | Groups                                                                           |
| ------------- | ----- | -------------------------------------------------------------------------------- |
| Remux Tier 01 | 975   | BLURANiUM, BMF, FraMeSToR, PmP                                                   |
| Remux Tier 02 | 950   | 12GaugeShotgun, decibeL, EPSiLON, HiFi, KRaLiMaRKo, playBD, PTer, SiCFoI, TRiToN |

Note: Remux tiers use `releaseGroup` type (not `releaseTitle`) and require Remux source.

### Penalty Formats (4 formats)

| Name            | Score  | Spec Type    | Pattern                                                                         |
| --------------- | ------ | ------------ | ------------------------------------------------------------------------------- |
| Anime Raws      | -10000 | releaseTitle | ~22 raw group patterns (AsukaRaws, Ohys-Raws, etc.)                             |
| Anime LQ Groups | -10000 | releaseTitle | ~264 low-quality group patterns                                                 |
| AV1             | -10000 | releaseTitle | `\bAV1\b`                                                                       |
| Dubs Only       | -10000 | releaseTitle | Dubbed/dub-only patterns + specific dub groups (Golumpa, KaiDubs, KamiFS, etc.) |

### Version Formats (5 formats)

| Name | Score | Pattern          |
| ---- | ----- | ---------------- |
| v0   | -51   | `(\b\|\d)(v0)\b` |
| v1   | 1     | `(\b\|\d)(v1)\b` |
| v2   | 2     | `(\b\|\d)(v2)\b` |
| v3   | 3     | `(\b\|\d)(v3)\b` |
| v4   | 4     | `(\b\|\d)(v4)\b` |

### Quality Indicators (3 formats)

| Name             | Score | Spec Type               | Pattern                                                                         |
| ---------------- | ----- | ----------------------- | ------------------------------------------------------------------------------- |
| 10bit            | 0     | releaseTitle            | `10[.-]?bit` and `hi10p` (two specs, OR logic)                                  |
| Anime Dual Audio | 0     | releaseTitle + language | Complex dual audio detection regex + language specs for Japanese/Chinese/Korean |
| Uncensored       | 0     | releaseTitle            | `\b(Uncut\|Unrated\|Uncensored\|AT[-_. ]?X)\b`                                  |

### Streaming Services (11 formats)

Each has a `releaseTitle` spec (required) for the service name + optional `videoSource` web specs.

| Name     | Score | Pattern                              |
| -------- | ----- | ------------------------------------ |
| CR       | 6     | `\b(C(runchy)?[ .-]?R(oll)?)\b`      |
| DSNP     | 5     | `\b(dsnp\|dsny\|disney\|Disney\+)\b` |
| NF       | 4     | `\b(nf\|netflix(u?hd)?)\b`           |
| AMZN     | 3     | `\b(amzn\|amazon(hd)?)\b`            |
| VRV      | 3     | `\b(VRV)\b`                          |
| FUNi     | 2     | `\b(FUNi(mation)?)\b`                |
| ABEMA    | 1     | `\b(ABEMA[ ._-]?(TV)?)\b`            |
| ADN      | 1     | `\b(ADN\|Anime Digital Network)\b`   |
| B-Global | 0     | `\b(B[ .-]?Global)\b`                |
| Bilibili | 0     | `\b(Bili(bili)?)\b`                  |
| HIDIVE   | 0     | `\b(HIDI(VE)?)\b`                    |

## Download Profile: Anime 1080p

| Setting                       | Value              |
| ----------------------------- | ------------------ |
| name                          | Anime 1080p        |
| contentType                   | tv                 |
| rootFolderPath                | ./data/anime/1080p |
| upgradeAllowed                | true               |
| icon                          | tv                 |
| categories                    | [5070] (TV/Anime)  |
| language                      | en                 |
| minCustomFormatScore          | 0                  |
| upgradeUntilCustomFormatScore | 10000              |

### Quality Items (descending preference)

Based on TRaSH's `[Anime] Remux-1080p` guide:

| Tier         | Formats                               | Notes                |
| ------------ | ------------------------------------- | -------------------- |
| 1 (top)      | Remux-1080p, Bluray-1080p             | Merged into one tier |
| 2            | WEBDL-1080p, WEBRip-1080p, HDTV-1080p | Merged into one tier |
| 3 (fallback) | WEBDL-720p, WEBRip-720p, HDTV-720p    | Merged into one tier |

**Cutoff:** Remux-1080p (upgrade up to this quality)

### Profile-Custom-Format Links

All 39 custom formats linked to this profile via `profileCustomFormats` join table, using the anime-specific scores listed above.

## Specification Type Mapping

Sonarr specification types map to Allstarr types:

| Sonarr                         | Allstarr                 | Notes                           |
| ------------------------------ | ------------------------ | ------------------------------- |
| SourceSpecification (6=Bluray) | videoSource: "Bluray"    |                                 |
| SourceSpecification (7=Remux)  | videoSource: "BlurayRaw" | Matches download_formats.source |
| SourceSpecification (5=DVD)    | videoSource: "DVD"       |                                 |
| SourceSpecification (3=WEBDL)  | videoSource: "Web"       |                                 |
| SourceSpecification (4=WEBRIP) | videoSource: "WebRip"    |                                 |
| SourceSpecification (1=WEB)    | videoSource: "Web"       | Same as WEBDL in Allstarr       |
| ReleaseTitleSpecification      | releaseTitle             | Regex on full release name      |
| ReleaseGroupSpecification      | releaseGroup             | Regex on extracted group name   |
| LanguageSpecification          | language                 | Language identifier string      |

## Files Changed

| File                                   | Change                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/custom-format-preset-data.ts` | Add "Anime 1080p" preset with all 39 CFs, scores, and thresholds                                           |
| `src/db/seed-custom-formats.ts`        | Fix profile-preset matching: match by preset name to profile name instead of `contentType` (see bug below) |
| `drizzle/0005_*.sql`                   | Migration: insert CFs, download profile, profile-CF links, quality items                                   |

## Seeder Bug Fix

`seed-custom-formats.ts` line 69 currently does:

```ts
const preset = PRESETS.find((p) => p.contentType === profile.contentType);
```

With two TV presets ("HD WEB Streaming" and "Anime 1080p"), this always returns the first match. The fix: match preset name to profile name instead. Each preset's `name` already corresponds to a download profile name, so change to:

```ts
const preset = PRESETS.find((p) => p.name === profile.name);
```

## Migration Strategy

The migration must:

1. Insert all 39 custom formats into `custom_formats` table
2. Insert the "Anime 1080p" download profile with quality items referencing existing download_formats by title subquery
3. Insert 39 rows into `profile_custom_formats` linking the profile to each CF with the correct score

This mirrors the pattern from `0000_deep_morlun.sql` where download profiles use subqueries to resolve download_format IDs.
