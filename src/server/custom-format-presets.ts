import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  customFormats,
  downloadProfiles,
  profileCustomFormats,
} from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { invalidateCFCache } from "./indexers/cf-scoring";
import type { CustomFormatSpecification } from "src/db/schema/custom-formats";

// ---------------------------------------------------------------------------
// Preset types
// ---------------------------------------------------------------------------

type PresetCF = {
  name: string;
  category: string;
  specifications: CustomFormatSpecification[];
  defaultScore: number;
  contentTypes: string[];
  description: string;
};

type Preset = {
  name: string;
  description: string;
  category: string;
  contentType: string;
  mediaType: string;
  customFormats: PresetCF[];
  scores: Record<string, number>;
  minCustomFormatScore: number;
  upgradeUntilCustomFormatScore: number;
};

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const PRESETS: Preset[] = [
  // ── HD Bluray + WEB (Movies) ───────────────────────────────────────────
  {
    name: "HD Bluray + WEB",
    description:
      "Prefer high-quality Bluray and WEB releases for movies. Penalizes low-quality groups, BR-DISKs, and x265 in HD.",
    category: "Video - Movies",
    contentType: "movie",
    mediaType: "video",
    customFormats: [
      {
        name: "Bluray Tier 01",
        category: "Release Group",
        specifications: [
          {
            name: "Bluray Tier 01 Groups",
            type: "releaseGroup",
            value:
              "^(FraMeSToR|HiFi|AJP69|BHDStudio|CRiSC|CtrlHD|DON|EbP|Geek|NCmt|TDD|ZQ|decibeL|playBD|HQMUX|SiCFoI|hallowed|SURFINBIRD)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 1800,
        contentTypes: ["movie"],
        description: "Top-tier Bluray release groups",
      },
      {
        name: "WEB Tier 01",
        category: "Release Group",
        specifications: [
          {
            name: "WEB Tier 01 Groups",
            type: "releaseGroup",
            value:
              "^(FLUX|CMRG|HONE|KiNGS|NOSiViD|NTb|QOQ|RTN|SiC|DEEP|ABBIE|dB|EDITH|FLUX|KHN|MZABI|NPMS|TOMMY|WEBDL)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 1700,
        contentTypes: ["movie"],
        description: "Top-tier WEB release groups",
      },
      {
        name: "x265 (HD)",
        category: "Video Codec",
        specifications: [
          {
            name: "x265/HEVC Codec",
            type: "videoCodec",
            value: "^(x265|hevc|h\\.?265)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["movie"],
        description:
          "Penalize x265 for HD content (quality loss at HD resolutions)",
      },
      {
        name: "LQ Groups",
        category: "Unwanted",
        specifications: [
          {
            name: "Low Quality Groups",
            type: "releaseGroup",
            value:
              "^(AROMA|BRiNK|CHD|EVO|FGT|FUM|GHOSTS|HiP|IGUANA|MeGusta|NERO|PNDi|PSA|RARBG|RDN|SAMPA|ShieldBearer|TGx|YIFY|YTS|Zeus|x0r)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["movie"],
        description: "Known low-quality release groups to avoid",
      },
      {
        name: "BR-DISK",
        category: "Quality Modifier",
        specifications: [
          {
            name: "BR-DISK Modifier",
            type: "qualityModifier",
            value: "brdisk",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["movie"],
        description: "Full Bluray disc images (too large, not re-encoded)",
      },
      {
        name: "TrueHD ATMOS",
        category: "Audio Codec",
        specifications: [
          {
            name: "TrueHD ATMOS",
            type: "audioCodec",
            value: "^(truehd[. _-]?atmos|atmos[. _-]?truehd)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 500,
        contentTypes: ["movie"],
        description: "Dolby TrueHD with Atmos - highest quality audio",
      },
      {
        name: "DTS-X",
        category: "Audio Codec",
        specifications: [
          {
            name: "DTS-X Audio",
            type: "audioCodec",
            value: "^dts[. _-]?x$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 400,
        contentTypes: ["movie"],
        description: "DTS:X immersive audio format",
      },
    ],
    scores: {
      "Bluray Tier 01": 1800,
      "WEB Tier 01": 1700,
      "x265 (HD)": -10_000,
      "LQ Groups": -10_000,
      "BR-DISK": -10_000,
      "TrueHD ATMOS": 500,
      "DTS-X": 400,
    },
    minCustomFormatScore: 0,
    upgradeUntilCustomFormatScore: 10_000,
  },

  // ── HD WEB Streaming (TV) ─────────────────────────────────────────────
  {
    name: "HD WEB Streaming",
    description:
      "Optimized for TV shows from streaming services. Prefers top WEB release groups and season packs.",
    category: "Video - TV",
    contentType: "tv",
    mediaType: "video",
    customFormats: [
      {
        name: "WEB Tier 01",
        category: "Release Group",
        specifications: [
          {
            name: "WEB Tier 01 Groups",
            type: "releaseGroup",
            value:
              "^(FLUX|CMRG|HONE|KiNGS|NOSiViD|NTb|QOQ|RTN|SiC|DEEP|ABBIE|dB|EDITH|FLUX|KHN|MZABI|NPMS|TOMMY|WEBDL)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 1700,
        contentTypes: ["tv"],
        description: "Top-tier WEB release groups",
      },
      {
        name: "WEB Tier 02",
        category: "Release Group",
        specifications: [
          {
            name: "WEB Tier 02 Groups",
            type: "releaseGroup",
            value:
              "^(PECULATE|CAKES|CRFW|MOCH|SMURF|STARZ|VLAD|BTW|CasStudio|Chill|GNOME|iJP|KOGI|LAZY|NTG|NYH|PECULATE|playWEB|RVKD|SA89|Scene|SDCC|SIGMA|SMURF|TEPES|TVSmash|XEBEC)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 1300,
        contentTypes: ["tv"],
        description: "Second-tier WEB release groups",
      },
      {
        name: "Season Pack",
        category: "Release Type",
        specifications: [
          {
            name: "Season Pack",
            type: "releaseType",
            value: "season",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 15,
        contentTypes: ["tv"],
        description: "Prefer season packs over individual episodes",
      },
      {
        name: "LQ Groups",
        category: "Unwanted",
        specifications: [
          {
            name: "Low Quality Groups",
            type: "releaseGroup",
            value:
              "^(AROMA|BRiNK|CHD|EVO|FGT|FUM|GHOSTS|HiP|IGUANA|MeGusta|NERO|PNDi|PSA|RARBG|RDN|SAMPA|ShieldBearer|TGx|YIFY|YTS|Zeus|x0r)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["tv"],
        description: "Known low-quality release groups to avoid",
      },
      {
        name: "x265 (HD)",
        category: "Video Codec",
        specifications: [
          {
            name: "x265/HEVC Codec",
            type: "videoCodec",
            value: "^(x265|hevc|h\\.?265)$",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["tv"],
        description:
          "Penalize x265 for HD content (quality loss at HD resolutions)",
      },
    ],
    scores: {
      "WEB Tier 01": 1700,
      "WEB Tier 02": 1300,
      "Season Pack": 15,
      "LQ Groups": -10_000,
      "x265 (HD)": -10_000,
    },
    minCustomFormatScore: 0,
    upgradeUntilCustomFormatScore: 5000,
  },

  // ── Retail EPUB Preferred (Ebook) ─────────────────────────────────────
  {
    name: "Retail EPUB Preferred",
    description:
      "Prefer retail ebook releases in EPUB format. Penalizes scene releases and PDFs.",
    category: "Books - Ebook",
    contentType: "book",
    mediaType: "ebook",
    customFormats: [
      {
        name: "Retail Release",
        category: "Source",
        specifications: [
          {
            name: "Retail Tag",
            type: "releaseTitle",
            value: "\\bretail\\b",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 1000,
        contentTypes: ["ebook"],
        description: "Retail (officially published) ebook releases",
      },
      {
        name: "Scene Release",
        category: "Unwanted",
        specifications: [
          {
            name: "Scene Tag",
            type: "releaseTitle",
            value: "\\bscene\\b",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["ebook"],
        description: "Scene releases are typically lower quality for ebooks",
      },
      {
        name: "EPUB Format",
        category: "File Format",
        specifications: [
          {
            name: "EPUB File",
            type: "fileFormat",
            value: "epub",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 500,
        contentTypes: ["ebook"],
        description: "EPUB format - the preferred ebook standard",
      },
      {
        name: "PDF Format",
        category: "File Format",
        specifications: [
          {
            name: "PDF File",
            type: "fileFormat",
            value: "pdf",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["ebook"],
        description: "PDF format - less flexible than EPUB for ebooks",
      },
    ],
    scores: {
      "Retail Release": 1000,
      "Scene Release": -500,
      "EPUB Format": 500,
      "PDF Format": -100,
    },
    minCustomFormatScore: 0,
    upgradeUntilCustomFormatScore: 2000,
  },

  // ── High Bitrate M4B (Audiobook) ──────────────────────────────────────
  {
    name: "High Bitrate M4B",
    description:
      "Prefer high-bitrate audiobooks in M4B format. Penalizes low-bitrate releases.",
    category: "Books - Audiobook",
    contentType: "book",
    mediaType: "audio",
    customFormats: [
      {
        name: "High Bitrate",
        category: "Audiobook Quality",
        specifications: [
          {
            name: "Min 192kbps",
            type: "audioBitrate",
            min: 192,
            negate: false,
            required: true,
          },
        ],
        defaultScore: 500,
        contentTypes: ["audiobook"],
        description: "Audiobooks with bitrate of 192kbps or higher",
      },
      {
        name: "M4B Format",
        category: "File Format",
        specifications: [
          {
            name: "M4B File",
            type: "fileFormat",
            value: "m4b",
            negate: false,
            required: true,
          },
        ],
        defaultScore: 300,
        contentTypes: ["audiobook"],
        description: "M4B format - preferred single-file audiobook container",
      },
      {
        name: "Low Bitrate",
        category: "Audiobook Quality",
        specifications: [
          {
            name: "Max 64kbps",
            type: "audioBitrate",
            max: 64,
            negate: false,
            required: true,
          },
        ],
        defaultScore: 0,
        contentTypes: ["audiobook"],
        description: "Low-bitrate audiobooks to avoid",
      },
    ],
    scores: {
      "High Bitrate": 500,
      "M4B Format": 300,
      "Low Bitrate": -1000,
    },
    minCustomFormatScore: 0,
    upgradeUntilCustomFormatScore: 1000,
  },
];

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const getPresetsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { contentType?: string; mediaType?: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    let filtered = PRESETS;

    if (data.contentType) {
      filtered = filtered.filter((p) => p.contentType === data.contentType);
    }
    if (data.mediaType) {
      filtered = filtered.filter((p) => p.mediaType === data.mediaType);
    }

    return filtered.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      contentType: p.contentType,
      mediaType: p.mediaType,
      cfCount: p.customFormats.length,
      scores: p.scores,
      minCustomFormatScore: p.minCustomFormatScore,
      upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
    }));
  });

export const applyPresetFn = createServerFn({ method: "POST" })
  .inputValidator((d: { profileId: number; presetName: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();

    // 1. Find preset
    const preset = PRESETS.find((p) => p.name === data.presetName);
    if (!preset) {
      throw new Error(`Preset "${data.presetName}" not found`);
    }

    // 2. Verify profile exists
    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, data.profileId))
      .get();
    if (!profile) {
      throw new Error("Download profile not found");
    }

    // 3. For each CF in preset: check if it exists by name, create if not
    const cfIdsByName: Record<string, number> = {};

    for (const presetCF of preset.customFormats) {
      const existing = db
        .select({ id: customFormats.id })
        .from(customFormats)
        .where(eq(customFormats.name, presetCF.name))
        .get();

      if (existing) {
        cfIdsByName[presetCF.name] = existing.id;
      } else {
        const created = db
          .insert(customFormats)
          .values({
            name: presetCF.name,
            category: presetCF.category,
            specifications: presetCF.specifications,
            defaultScore: presetCF.defaultScore,
            contentTypes: presetCF.contentTypes,
            description: presetCF.description,
            origin: "builtin",
            userModified: false,
          })
          .returning()
          .get();
        cfIdsByName[presetCF.name] = created.id;
      }
    }

    // 4. Delete existing profile_custom_formats for this profile
    db.delete(profileCustomFormats)
      .where(eq(profileCustomFormats.profileId, data.profileId))
      .run();

    // 5. Insert new scores
    const scoreEntries = Object.entries(preset.scores);
    if (scoreEntries.length > 0) {
      db.insert(profileCustomFormats)
        .values(
          scoreEntries
            .filter(([name]) => cfIdsByName[name] !== undefined)
            .map(([name, score]) => ({
              profileId: data.profileId,
              customFormatId: cfIdsByName[name],
              score,
            })),
        )
        .run();
    }

    // 6. Update profile's CF score thresholds
    db.update(downloadProfiles)
      .set({
        minCustomFormatScore: preset.minCustomFormatScore,
        upgradeUntilCustomFormatScore: preset.upgradeUntilCustomFormatScore,
      })
      .where(eq(downloadProfiles.id, data.profileId))
      .run();

    invalidateCFCache();

    return {
      success: true,
      cfCount: Object.keys(cfIdsByName).length,
      presetName: preset.name,
    };
  });
