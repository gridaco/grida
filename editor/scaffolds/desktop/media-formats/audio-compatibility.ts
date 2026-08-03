/** Browser/Electron compatibility metadata for local audio formats. */
export namespace AudioCompatibility {
  export const ACCEPT = [
    ".mp3",
    ".wav",
    ".flac",
    ".ogg",
    ".oga",
    ".opus",
    ".webm",
    ".m4a",
    ".aac",
    "audio/mpeg",
    "audio/wav",
    "audio/flac",
    "audio/ogg",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ].join(",");

  export const FORMATS = [
    {
      id: "mp3",
      label: "MP3",
      extensions: [".mp3"],
      mimeType: "audio/mpeg",
      tier: "stable",
    },
    {
      id: "wav",
      label: "WAV",
      extensions: [".wav"],
      mimeType: "audio/wav",
      tier: "stable",
    },
    {
      id: "flac",
      label: "FLAC",
      extensions: [".flac"],
      mimeType: "audio/flac",
      tier: "stable",
    },
    {
      id: "ogg",
      label: "Ogg audio",
      extensions: [".ogg", ".oga"],
      mimeType: "audio/ogg",
      tier: "stable",
    },
    {
      id: "opus",
      label: "Ogg Opus",
      extensions: [".opus"],
      mimeType: 'audio/ogg; codecs="opus"',
      tier: "stable",
    },
    {
      id: "webm",
      label: "WebM audio",
      extensions: [".webm"],
      mimeType: "audio/webm",
      tier: "stable",
    },
    {
      id: "m4a",
      label: "M4A / AAC",
      extensions: [".m4a"],
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      tier: "conditional",
    },
    {
      id: "aac",
      label: "AAC",
      extensions: [".aac"],
      mimeType: "audio/aac",
      tier: "conditional",
    },
  ] as const satisfies readonly FormatInfo[];

  export type Format = (typeof FORMATS)[number]["id"] | "unknown";
  export type Tier = "stable" | "conditional" | "unsupported";
  export type Playability = "probably" | "maybe" | "unsupported" | "unprobed";

  export type FormatInfo = Readonly<{
    id: string;
    label: string;
    extensions: readonly string[];
    mimeType: string;
    tier: Exclude<Tier, "unsupported">;
  }>;

  export type Inference = Readonly<{
    format: Format;
    label: string;
    extension: string;
    mimeType: string | null;
    tier: Tier;
  }>;

  export type SupportResult = Inference &
    Readonly<{
      playability: Playability;
      canPlay: boolean | null;
    }>;

  export type CanPlayType = (mimeType: string) => "" | "maybe" | "probably";

  export function infer(file: Pick<File, "name" | "type">): Inference {
    const extension = fileExtension(file.name);
    const normalizedMime = file.type.toLowerCase().split(";", 1)[0].trim();
    const id = inferFormat(extension, normalizedMime);
    const format = FORMATS.find((candidate) => candidate.id === id);
    if (!format) {
      return {
        format: "unknown",
        label: "Unknown audio",
        extension,
        mimeType: normalizedMime || null,
        tier: "unsupported",
      };
    }
    return {
      format: format.id,
      label: format.label,
      extension,
      mimeType: format.mimeType,
      tier: format.tier,
    };
  }

  export function probe(
    file: Pick<File, "name" | "type">,
    canPlayType: CanPlayType | null = browserCanPlayType()
  ): SupportResult {
    const inference = infer(file);
    if (inference.tier === "unsupported" || !inference.mimeType) {
      return {
        ...inference,
        playability: "unsupported",
        canPlay: false,
      };
    }
    if (!canPlayType) {
      return {
        ...inference,
        playability: "unprobed",
        canPlay: null,
      };
    }
    const result = canPlayType(inference.mimeType);
    return {
      ...inference,
      playability: result || "unsupported",
      canPlay: result !== "",
    };
  }

  function inferFormat(extension: string, mimeType: string): Format {
    if (extension === ".opus") return "opus";
    const byExtension = FORMATS.find((candidate) =>
      candidate.extensions.includes(extension as never)
    );
    if (byExtension) return byExtension.id;

    switch (mimeType) {
      case "audio/mpeg":
      case "audio/mp3":
        return "mp3";
      case "audio/wav":
      case "audio/wave":
      case "audio/x-wav":
        return "wav";
      case "audio/flac":
      case "audio/x-flac":
        return "flac";
      case "audio/ogg":
      case "audio/opus":
        return mimeType === "audio/opus" ? "opus" : "ogg";
      case "audio/webm":
        return "webm";
      case "audio/mp4":
      case "audio/x-m4a":
        return "m4a";
      case "audio/aac":
        return "aac";
      default:
        return "unknown";
    }
  }

  function fileExtension(name: string): string {
    const leaf = name.split(/[\\/]/).at(-1) ?? name;
    const dot = leaf.lastIndexOf(".");
    return dot > 0 ? leaf.slice(dot).toLowerCase() : "";
  }

  function browserCanPlayType(): CanPlayType | null {
    if (typeof document === "undefined") return null;
    const audio = document.createElement("audio");
    return (mimeType) => audio.canPlayType(mimeType);
  }
}
