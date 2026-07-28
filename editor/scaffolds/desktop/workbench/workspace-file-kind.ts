import { dotcanvas } from "dotcanvas";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

/**
 * The workbench's path-derived file family.
 *
 * One classifier drives both editor dispatch and tab-preview chrome so the two
 * surfaces cannot drift into disagreeing about the same path.
 */
export namespace WorkspaceFileKind {
  export type Kind =
    | "canvas"
    | "svg"
    | "image"
    | "video"
    | "markdown"
    | "text"
    | "binary";

  export type BinaryFamily =
    | "archive"
    | "audio"
    | "document"
    | "spreadsheet"
    | "presentation"
    | "font"
    | "package"
    | "database"
    | "design"
    | "binary";

  const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

  const PLAIN_TEXT_EXTENSIONS = new Set([
    ".txt",
    ".text",
    ".log",
    ".csv",
    ".tsv",
    ".env",
    ".ini",
    ".cfg",
    ".conf",
    ".config",
    ".properties",
    ".lock",
    ".jsonc",
    ".json5",
    ".mdx",
    ".svelte",
    ".astro",
    ".prisma",
    ".graphql",
    ".gql",
    ".tf",
    ".tfvars",
    ".hcl",
    ".nix",
    ".gradle",
    ".cmake",
    ".rego",
    ".sol",
    ".mustache",
    ".hbs",
    ".liquid",
    ".ejs",
    ".njk",
  ]);

  const PLAIN_TEXT_FILENAMES = new Set([
    "readme",
    "license",
    "notice",
    "authors",
    "contributors",
    "changelog",
    "changes",
    "copying",
    "codeowners",
    "makefile",
    "rakefile",
    "gemfile",
    "brewfile",
    "procfile",
    "justfile",
    ".env",
    ".gitignore",
    ".gitattributes",
    ".gitmodules",
    ".gitconfig",
    ".editorconfig",
    ".npmrc",
    ".yarnrc",
    ".nvmrc",
    ".node-version",
    ".python-version",
    ".ruby-version",
    ".tool-versions",
    ".dockerignore",
    ".prettierignore",
    ".eslintignore",
    ".stylelintignore",
    ".prettierrc",
    ".eslintrc",
    ".babelrc",
    ".browserslistrc",
    ".stylelintrc",
    ".postcssrc",
  ]);

  const IMAGE_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".avif",
    ".bmp",
    ".ico",
    ".tiff",
    ".tif",
  ]);

  const VIDEO_EXTENSIONS = new Set([
    ".mp4",
    ".m4v",
    ".webm",
    ".mov",
    ".ogv",
    ".ogg",
    ".mpg",
    ".mpeg",
    ".avi",
    ".mkv",
    ".3gp",
    ".3g2",
  ]);

  const BINARY_EXTENSIONS_BY_FAMILY: Record<
    Exclude<BinaryFamily, "binary">,
    ReadonlySet<string>
  > = {
    archive: new Set([
      ".zip",
      ".7z",
      ".rar",
      ".tar",
      ".tgz",
      ".gz",
      ".bz2",
      ".xz",
      ".zst",
    ]),
    audio: new Set([
      ".mp3",
      ".wav",
      ".flac",
      ".aac",
      ".m4a",
      ".opus",
      ".oga",
      ".aiff",
      ".wma",
    ]),
    document: new Set([
      ".pdf",
      ".doc",
      ".docx",
      ".odt",
      ".rtf",
      ".pages",
      ".epub",
    ]),
    spreadsheet: new Set([".xls", ".xlsx", ".ods", ".numbers"]),
    presentation: new Set([".ppt", ".pptx", ".odp", ".key"]),
    font: new Set([".ttf", ".otf", ".woff", ".woff2", ".eot"]),
    package: new Set([
      ".dmg",
      ".pkg",
      ".iso",
      ".exe",
      ".msi",
      ".deb",
      ".rpm",
      ".apk",
      ".ipa",
      ".appimage",
    ]),
    database: new Set([
      ".sqlite",
      ".sqlite3",
      ".db",
      ".parquet",
      ".arrow",
      ".avro",
    ]),
    design: new Set([
      ".psd",
      ".ai",
      ".indd",
      ".sketch",
      ".fig",
      ".xd",
      ".blend",
      ".fbx",
      ".obj",
      ".gltf",
      ".glb",
      ".dwg",
      ".dxf",
    ]),
  };

  const MIME_BY_EXTENSION: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogv": "video/ogg",
    ".ogg": "video/ogg",
    ".mpg": "video/mpeg",
    ".mpeg": "video/mpeg",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".3gp": "video/3gpp",
    ".3g2": "video/3gpp2",
    ".zip": "application/zip",
  };

  export function of(relPath: string): Kind {
    const ext = extension(relPath);
    if (ext === dotcanvas.BUNDLE_EXTENSION) return "canvas";
    if (ext === ".svg") return "svg";
    if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    if (isSupportedText(relPath)) return "text";
    return "binary";
  }

  export function extension(relPath: string): string {
    const name = filename(relPath);
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return "";
    return name.slice(dot).toLowerCase();
  }

  export function filename(relPath: string): string {
    return relPath.split("/").pop() ?? relPath;
  }

  export function parentPath(relPath: string): string | null {
    const parts = relPath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
  }

  export function binaryFamily(relPath: string): BinaryFamily {
    const ext = extension(relPath);
    for (const family of Object.keys(BINARY_EXTENSIONS_BY_FAMILY) as Array<
      Exclude<BinaryFamily, "binary">
    >) {
      if (BINARY_EXTENSIONS_BY_FAMILY[family].has(ext)) return family;
    }
    return "binary";
  }

  export function label(relPath: string): string {
    switch (of(relPath)) {
      case "canvas":
        return "Canvas";
      case "svg":
        return "SVG";
      case "image":
        return "Image";
      case "video":
        return "Video";
      case "markdown":
        return "Markdown";
      case "text":
        return "Text";
      case "binary":
        return binaryFamilyLabel(binaryFamily(relPath));
    }
  }

  export function mimeType(relPath: string): string {
    return MIME_BY_EXTENSION[extension(relPath)] ?? "application/octet-stream";
  }

  function isSupportedText(relPath: string): boolean {
    const filenameValue = filename(relPath);
    const name = filenameValue.toLowerCase();
    if (PLAIN_TEXT_FILENAMES.has(name) || name.startsWith(".env.")) return true;
    if (PLAIN_TEXT_EXTENSIONS.has(extension(name))) return true;
    return (
      LanguageDescription.matchFilename(languages, filenameValue) !== null ||
      LanguageDescription.matchFilename(languages, name) !== null
    );
  }

  function binaryFamilyLabel(family: BinaryFamily): string {
    switch (family) {
      case "archive":
        return "Archive";
      case "audio":
        return "Audio";
      case "document":
        return "Document";
      case "spreadsheet":
        return "Spreadsheet";
      case "presentation":
        return "Presentation";
      case "font":
        return "Font";
      case "package":
        return "Package";
      case "database":
        return "Database";
      case "design":
        return "Design file";
      case "binary":
        return "File";
    }
  }
}
