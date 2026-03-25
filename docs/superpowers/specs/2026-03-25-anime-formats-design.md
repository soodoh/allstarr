# Anime Custom Formats, Download Profile & Series Type Filtering

Add TRaSH Guides anime custom formats, an "Anime 1080p" TV download profile, a `seriesTypes` field on download profiles for TV series type filtering, and a series type selector in the show edit dialog.

## Source of Truth

TRaSH Guides Sonarr anime quality profile: the `[Anime] Remux-1080p` configuration. All custom format names, specifications, and scores come directly from TRaSH's JSON definitions at `https://github.com/TRaSH-Guides/Guides/tree/master/docs/json/sonarr/cf/`.

---

## 1. Custom Formats (39 total)

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

---

## 2. Download Profile: Anime 1080p

| Setting                       | Value              |
| ----------------------------- | ------------------ |
| name                          | Anime 1080p        |
| contentType                   | tv                 |
| rootFolderPath                | ./data/anime/1080p |
| upgradeAllowed                | true               |
| icon                          | tv                 |
| categories                    | [5070] (TV/Anime)  |
| language                      | en                 |
| seriesTypes                   | ["anime"]          |
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

---

## 3. Series Types on Download Profiles

### Schema Change

Add `series_types` column to `download_profiles` table:

- **Type:** JSON array of strings
- **Default:** `["standard", "daily", "anime"]` (all three)
- **Validation:** When `contentType === "tv"`, at least one series type must be selected

### Migration Data

| Profile         | seriesTypes                              |
| --------------- | ---------------------------------------- |
| 1080p (TV)      | ["standard", "daily"]                    |
| 4k (TV)         | ["standard", "daily"]                    |
| Anime 1080p     | ["anime"]                                |
| Non-TV profiles | ["standard", "daily", "anime"] (default) |

### Profile Filtering by Series Type

When assigning download profiles to a show, filter by both content type AND series type. Three locations:

1. `src/components/tv/tmdb-show-search.tsx:88` — show add flow
2. `src/components/tv/show-detail-header.tsx:238` — show edit dialog
3. `src/routes/_authed/tv/index.tsx:35` — TV index page

Filter logic: `profile.contentType === "tv" && profile.seriesTypes.includes(show.seriesType)`

---

## 4. Series Type in Show Edit Dialog

The edit dialog at `show-detail-header.tsx` already has `seriesType` state (line 126) and passes it to the update mutation (line 152), but the UI control is not rendered. Add a Series Type select dropdown matching the one in the add flow.

### Conflict Resolution on Series Type Change

When the user changes series type in the edit dialog, previously-assigned profiles may no longer be valid for the new series type. The dialog must detect and resolve conflicts before saving.

**Flow:**

1. User changes series type (e.g., "standard" -> "anime")
2. Re-filter available profiles to match the new series type
3. Detect conflicts — currently-assigned profiles not in the new filtered list
4. For each conflicting profile, show an inline prompt:
   - **Remove** — unassign the profile from this show (cascades to episode profiles). Files on disk are not deleted.
   - **Migrate to [profile]** — reassign episodes/files from the conflicting profile to a user-selected valid profile. Only shown if valid profiles exist for the new series type.
5. Save button disabled until all conflicts are resolved

**Example:** User changes from "standard" to "anime":

- "1080p (TV)" was assigned with monitored episodes
- Dialog shows: "1080p (TV) is not available for Anime series"
  - Option A: "Remove profile"
  - Option B: "Migrate to Anime 1080p"
- User resolves conflict -> save enabled

---

## 5. Preset Picker

The `PRESETS` array supports multiple presets per content type. Each has `name` and `description`. When creating or managing download profiles, show presets grouped by content type with their description blurbs.

For TV, users would see:

- **HD WEB Streaming** — "Optimized for TV shows from streaming services..."
- **Anime 1080p** — (anime-specific description)

Presets are filtered by `contentType` only (not series type). Presets are templates for creating profiles. The `seriesTypes` field on the profile is set independently by the user.

---

## 6. Specification Type Mapping

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

---

## 7. Files Changed

| File                                       | Change                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/custom-format-preset-data.ts`     | Add `profileName` field to Preset type, add "Anime 1080p" preset with all 39 CFs, scores, and thresholds                        |
| `src/db/schema/download-profiles.ts`       | Add `seriesTypes` column (JSON array, default all three)                                                                        |
| `src/db/seed-custom-formats.ts`            | Fix preset-profile matching: by name instead of contentType                                                                     |
| `src/lib/tmdb-validators.ts`               | Add seriesTypes validation to download profile schema                                                                           |
| `src/lib/validators.ts`                    | Add seriesTypes to download profile validators with TV-specific >=1 validation                                                  |
| `src/components/tv/tmdb-show-search.tsx`   | Filter profiles by series type in add flow                                                                                      |
| `src/components/tv/show-detail-header.tsx` | Add Series Type dropdown + conflict resolution UI in edit dialog                                                                |
| `src/routes/_authed/tv/index.tsx`          | Filter profiles by series type                                                                                                  |
| `drizzle/0005_*.sql`                       | Migration: add seriesTypes column, insert CFs, insert Anime 1080p profile, update existing TV profiles, insert profile-CF links |

## 8. Seeder Bug Fix

`seed-custom-formats.ts` line 69 currently does:

```ts
const preset = PRESETS.find((p) => p.contentType === profile.contentType);
```

With multiple TV presets, this always returns the first match. Additionally, preset names don't match profile names:

| Preset Name             | Profile Name        |
| ----------------------- | ------------------- |
| "HD WEB Streaming"      | "1080p (TV)"        |
| "HD Bluray + WEB"       | "720-1080p (Movie)" |
| "Retail EPUB Preferred" | "Ebook"             |
| "High Bitrate M4B"      | "Audiobook"         |
| "Anime 1080p"           | "Anime 1080p"       |

**Fix:** Add a `profileName` field to the `Preset` type that maps each preset to its corresponding download profile name. Update the seeder to match by this field:

```ts
// In custom-format-preset-data.ts
export type Preset = {
  name: string; // Display name for preset picker UI
  profileName: string; // Maps to download_profiles.name
  // ... existing fields
};

// In seed-custom-formats.ts
const preset = PRESETS.find((p) => p.profileName === profile.name);
```

Each existing preset gets its `profileName` set to the corresponding download profile name. The 4k profiles (4k TV, 4k Movie) have no matching preset — this is fine, they won't get auto-linked CFs (matching current behavior where only the first contentType match got linked).

## 9. Migration Strategy

The migration must:

1. Add `series_types` column to `download_profiles` with default `'["standard","daily","anime"]'`
2. Update existing TV profiles: set 1080p/4k to `'["standard","daily"]'`
3. Insert all 39 anime custom formats into `custom_formats`
4. Insert the "Anime 1080p" download profile with `seriesTypes: ["anime"]` and quality items via subqueries
5. Insert 39 rows into `profile_custom_formats` linking the anime profile to each CF with correct scores

This mirrors the pattern from `0000_deep_morlun.sql` where download profiles use subqueries to resolve download_format IDs.
