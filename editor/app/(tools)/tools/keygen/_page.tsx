"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { generateKeypairAction } from "./actions";

type Encoding = "base64url" | "hex";
type CopyFormat = "plain" | "env" | "header" | "json";
type Strength = "default" | "strong";
type ScenarioKind = "bytes" | "pkce" | "keypair";
type ScenarioId =
  | "s2s"
  | "webhook"
  | "jwt-hs256"
  | "session"
  | "jwt-keypair"
  | "aes-256-gcm"
  | "xchacha20-poly1305"
  | "pkce";
type KeypairAlgorithm = "ES256" | "RS256";

type Scenario = {
  id: ScenarioId;
  title: string;
  shortTitle: string;
  whenToUse: string;
  defaultLine: string;
  kind: ScenarioKind;
  defaultBytes?: number;
  strongBytes?: number;
  defaultEncoding?: Encoding;
  envKeys?: string[];
  headerKey?: string;
  jsonKey?: string;
  supportedFormats: CopyFormat[];
  panelDescription: string[];
  safetyNote?: string;
  howToUse: string;
  anchorId: string;
  seoDescription: string;
};

type GeneratedData =
  | { kind: "bytes"; bytes: Uint8Array; alnumToken?: string }
  | { kind: "pkce"; verifier: string; challenge: string }
  | { kind: "keypair"; privateKeyPem: string; publicKeyPem: string };

const FORMAT_OPTIONS: { id: CopyFormat; label: string }[] = [
  { id: "plain", label: "Plain" },
  { id: "env", label: ".env" },
  { id: "header", label: "Header" },
  { id: "json", label: "JSON" },
];

const ENCODING_OPTIONS: { id: Encoding; label: string }[] = [
  { id: "base64url", label: "base64url" },
  { id: "hex", label: "hex" },
];

const KEYPAIR_OPTIONS: { id: KeypairAlgorithm; label: string; hint: string }[] =
  [
    { id: "ES256", label: "ES256 (P-256)", hint: "Recommended" },
    { id: "RS256", label: "RS256 (RSA-2048)", hint: "Fallback" },
  ];

const PKCE_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const ALNUM_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

type QuickPickId =
  | "s2s"
  | "webhook"
  | "jwt-hs256"
  | "session"
  | "aes-256-gcm"
  | "xchacha20-poly1305";

type QuickPickSpec = {
  id: QuickPickId;
  title: string;
  count: number;
  layout: "grid2" | "list";
  bytes: number;
  encoding: Encoding;
};

const QUICK_PICKS: QuickPickSpec[] = [
  {
    id: "s2s",
    title: "S2S API key",
    count: 4,
    layout: "grid2",
    bytes: 32,
    encoding: "base64url",
  },
  {
    id: "webhook",
    title: "Webhook secret",
    count: 3,
    layout: "list",
    bytes: 32,
    encoding: "base64url",
  },
  {
    id: "jwt-hs256",
    title: "JWT secret (HS256)",
    count: 3,
    layout: "list",
    bytes: 32,
    encoding: "base64url",
  },
  {
    id: "session",
    title: "Session secret",
    count: 3,
    layout: "list",
    bytes: 32,
    encoding: "base64url",
  },
  {
    id: "aes-256-gcm",
    title: "AES-256-GCM key",
    count: 3,
    layout: "list",
    bytes: 32,
    encoding: "hex",
  },
  {
    id: "xchacha20-poly1305",
    title: "XChaCha20-Poly1305 key",
    count: 3,
    layout: "list",
    bytes: 32,
    encoding: "hex",
  },
];

const MEMORABLE_WORDS = [
  "above",
  "acorn",
  "across",
  "actor",
  "adapt",
  "after",
  "agent",
  "agree",
  "alley",
  "alpha",
  "amber",
  "amuse",
  "angel",
  "ankle",
  "apple",
  "april",
  "arena",
  "argon",
  "arrow",
  "asset",
  "atlas",
  "audio",
  "aunt",
  "awake",
  "bacon",
  "badge",
  "bamboo",
  "banjo",
  "basic",
  "basket",
  "beacon",
  "beach",
  "beard",
  "begin",
  "below",
  "bench",
  "berry",
  "bingo",
  "bison",
  "black",
  "blade",
  "blank",
  "bless",
  "blind",
  "bliss",
  "block",
  "bloom",
  "blue",
  "bonus",
  "boost",
  "brass",
  "brave",
  "bread",
  "breeze",
  "brick",
  "brief",
  "bright",
  "bronze",
  "buddy",
  "buffer",
  "bundle",
  "cabin",
  "cactus",
  "camera",
  "candy",
  "canoe",
  "canvas",
  "carbon",
  "cargo",
  "carpet",
  "carry",
  "castle",
  "casual",
  "cello",
  "center",
  "ceramic",
  "chance",
  "charm",
  "cheese",
  "cherry",
  "chess",
  "chill",
  "choice",
  "chorus",
  "cinder",
  "circle",
  "civic",
  "claim",
  "cliff",
  "clock",
  "cloud",
  "coach",
  "cocoa",
  "coffee",
  "color",
  "comet",
  "cookie",
  "coral",
  "corner",
  "cotton",
  "couch",
  "craft",
  "crane",
  "crisp",
  "cross",
  "crowd",
  "crown",
  "crystal",
  "cuddle",
  "custom",
  "cycle",
  "daisy",
  "dance",
  "daring",
  "debut",
  "delta",
  "denim",
  "depth",
  "design",
  "desert",
  "detail",
  "device",
  "dinner",
  "direct",
  "doctor",
  "dolphin",
  "donut",
  "dragon",
  "drama",
  "dream",
  "drift",
  "eager",
  "eagle",
  "earth",
  "echo",
  "elbow",
  "ember",
  "engine",
  "enjoy",
  "entry",
  "equal",
  "error",
  "event",
  "exact",
  "extra",
  "fabric",
  "factor",
  "falcon",
  "family",
  "fancy",
  "feather",
  "fiber",
  "field",
  "figure",
  "filter",
  "final",
  "finite",
  "forest",
  "forward",
  "frame",
  "fresh",
  "friend",
  "frost",
  "future",
  "galaxy",
  "garden",
  "garnet",
  "gentle",
  "giant",
  "ginger",
  "glance",
  "glide",
  "globe",
  "glow",
  "gold",
  "grace",
  "grain",
  "graph",
  "green",
  "grid",
  "group",
  "habit",
  "hammer",
  "handle",
  "happy",
  "harbor",
  "hazel",
  "health",
  "height",
  "hero",
  "honey",
  "honor",
  "hover",
  "human",
  "hurry",
  "image",
  "index",
  "input",
  "island",
  "ivory",
  "jacket",
  "jelly",
  "jewel",
  "jolly",
  "judge",
  "juice",
  "jumbo",
  "jungle",
  "keeper",
  "kernel",
  "kettle",
  "keyboard",
  "kindle",
  "kitten",
  "ladder",
  "laser",
  "later",
  "layer",
  "leader",
  "lemon",
  "level",
  "library",
  "light",
  "limit",
  "linear",
  "lion",
  "little",
  "lizard",
  "local",
  "logic",
  "lucky",
  "lunar",
  "magic",
  "mango",
  "manual",
  "maple",
  "marble",
  "market",
  "matrix",
  "meadow",
  "memory",
  "metal",
  "method",
  "midnight",
  "mirror",
  "model",
  "moment",
  "monkey",
  "month",
  "motion",
  "mountain",
  "mystery",
  "native",
  "nature",
  "nectar",
  "needle",
  "never",
  "noble",
  "noise",
  "north",
  "note",
  "novel",
  "nugget",
  "number",
  "object",
  "ocean",
  "olive",
  "omega",
  "onion",
  "opera",
  "orange",
  "orbit",
  "origin",
  "other",
  "output",
  "oxygen",
  "paddle",
  "paper",
  "parade",
  "parent",
  "party",
  "patch",
  "pearl",
  "people",
  "pepper",
  "petal",
  "photon",
  "piano",
  "picture",
  "pilot",
  "pixel",
  "planet",
  "plastic",
  "player",
  "plaza",
  "pocket",
  "poem",
  "pollen",
  "pony",
  "portal",
  "potion",
  "prism",
  "private",
  "process",
  "proper",
  "public",
  "pulse",
  "purple",
  "puzzle",
  "quantum",
  "quick",
  "quiet",
  "radar",
  "radio",
  "rapid",
  "reason",
  "record",
  "reef",
  "repair",
  "report",
  "resist",
  "rhythm",
  "ribbon",
  "river",
  "robot",
  "rocket",
  "round",
  "royal",
  "ruby",
  "safety",
  "salad",
  "salt",
  "sample",
  "satin",
  "scale",
  "scene",
  "script",
  "secret",
  "shadow",
  "shape",
  "shared",
  "signal",
  "silver",
  "simple",
  "siren",
  "sketch",
  "sky",
  "solid",
  "sound",
  "south",
  "spark",
  "spice",
  "spider",
  "spring",
  "square",
  "stable",
  "star",
  "status",
  "stone",
  "storm",
  "story",
  "style",
  "summer",
  "sunset",
  "system",
  "table",
  "tackle",
  "talent",
  "target",
  "teal",
  "tempo",
  "tender",
  "tenant",
  "theory",
  "thread",
  "tiger",
  "token",
  "topic",
  "tower",
  "travel",
  "treat",
  "tulip",
  "tunnel",
  "turtle",
  "twist",
  "union",
  "unique",
  "update",
  "value",
  "vector",
  "velvet",
  "verify",
  "violet",
  "virtual",
  "vision",
  "vivid",
  "voice",
  "wallet",
  "wander",
  "wave",
  "weapon",
  "week",
  "whale",
  "winter",
  "wizard",
  "wonder",
  "world",
  "xenon",
  "yellow",
  "zebra",
  "zenith",
  "zero",
  "zesty",
];

function estimateBitsForCharset(length: number, charsetSize: number) {
  if (length <= 0 || charsetSize <= 1) return 0;
  return Math.round(length * Math.log2(charsetSize));
}

function estimateBitsForWords(wordCount: number, wordlistSize: number) {
  if (wordCount <= 0 || wordlistSize <= 1) return 0;
  return Math.round(wordCount * Math.log2(wordlistSize));
}

function randomInt(maxExclusive: number) {
  const max = Math.floor(maxExclusive);
  if (max <= 1) return 0;

  // Unbiased uint32 sampling (rejection sampling).
  const range = 0x1_0000_0000; // 2^32
  const threshold = range - (range % max);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const bytes = randomBytes(4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const value = view.getUint32(0, true);
    if (value < threshold) return value % max;
  }
}

function generateMemorableSlug(wordCount = 5) {
  const words = Array.from({ length: wordCount }, () => {
    const index = randomInt(MEMORABLE_WORDS.length);
    return MEMORABLE_WORDS[index];
  });
  return words.join("-");
}

function generateUuidV4() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // Fallback v4 using getRandomValues
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateQuickPickValues(spec: QuickPickSpec): string[] {
  return Array.from({ length: spec.count }, () => {
    const rawBytes = randomBytes(spec.bytes);
    return spec.encoding === "hex"
      ? bytesToHex(rawBytes)
      : bytesToBase64Url(rawBytes);
  });
}

const SCENARIOS: Scenario[] = [
  {
    id: "s2s",
    title: "Server-to-Server (S2S) API Key Generator",
    shortTitle: "S2S API key",
    whenToUse: "Use for private service to service calls between backends.",
    defaultLine: "Default: 32 bytes, base64url.",
    kind: "bytes",
    defaultBytes: 32,
    strongBytes: 64,
    defaultEncoding: "base64url",
    envKeys: ["S2S_PRIVATE_API_KEY", "INTERNAL_PROXY_TOKEN"],
    headerKey: "x-api-key",
    jsonKey: "s2sApiKey",
    supportedFormats: ["plain", "env", "header", "json"],
    panelDescription: [
      "Random token for internal APIs and backend to backend calls.",
      "Keep it server side and rotate it regularly.",
    ],
    howToUse: `const apiKey = process.env.S2S_PRIVATE_API_KEY;
if (req.headers["x-api-key"] !== apiKey) {
  res.status(401).end();
}`,
    anchorId: "server-to-server-s2s-api-key-generator",
    seoDescription:
      "Use a private API key for internal services and backend to backend calls. Rotate it on a schedule.",
  },
  {
    id: "webhook",
    title: "Webhook Signing Secret Generator (HMAC-SHA256)",
    shortTitle: "Webhook secret",
    whenToUse: "Use to sign and verify webhook payloads from providers.",
    defaultLine: "Default: 32 bytes, base64url.",
    kind: "bytes",
    defaultBytes: 32,
    strongBytes: 64,
    defaultEncoding: "base64url",
    envKeys: ["WEBHOOK_SIGNING_SECRET"],
    headerKey: "x-webhook-secret",
    jsonKey: "webhookSecret",
    supportedFormats: ["plain", "env", "header", "json"],
    panelDescription: [
      "Shared secret for HMAC SHA256 webhook signatures.",
      "Never expose it to clients or logs.",
    ],
    howToUse: `const secret = process.env.WEBHOOK_SIGNING_SECRET;
const signature = crypto
  .createHmac("sha256", secret)
  .update(\`\${timestamp}.\${payload}\`)
  .digest("hex");`,
    anchorId: "webhook-signing-secret-generator",
    seoDescription:
      "Use an HMAC SHA256 secret to verify webhook signatures and reject tampered payloads.",
  },
  {
    id: "jwt-hs256",
    title: "JWT Secret Generator (HS256)",
    shortTitle: "JWT secret",
    whenToUse: "Use for JWT signing when one backend holds the secret.",
    defaultLine: "Default: 32 bytes, base64url.",
    kind: "bytes",
    defaultBytes: 32,
    strongBytes: 64,
    defaultEncoding: "base64url",
    envKeys: ["JWT_SECRET"],
    headerKey: "x-jwt-secret",
    jsonKey: "jwtSecret",
    supportedFormats: ["plain", "env", "json"],
    panelDescription: [
      "Symmetric secret for HS256 JWT signing.",
      "Prefer RS256 or ES256 when multiple services verify tokens.",
    ],
    safetyNote: "Anyone with this secret can mint tokens.",
    howToUse: `const secret = process.env.JWT_SECRET;
const token = jwt.sign({ sub: userId }, secret, {
  algorithm: "HS256",
  expiresIn: "15m",
});`,
    anchorId: "jwt-secret-generator-hs256",
    seoDescription:
      "Generate a strong HS256 secret for JWT signing when a single service owns the key.",
  },
  {
    id: "session",
    title: "Session / Cookie Secret Generator",
    shortTitle: "Session secret",
    whenToUse: "Use for signing cookies and server sessions.",
    defaultLine: "Default: 32 bytes, base64url.",
    kind: "bytes",
    defaultBytes: 32,
    strongBytes: 64,
    defaultEncoding: "base64url",
    envKeys: ["SESSION_SECRET"],
    headerKey: "x-session-secret",
    jsonKey: "sessionSecret",
    supportedFormats: ["plain", "env", "json"],
    panelDescription: [
      "Secret for session middleware and cookie signing.",
      "Rotate when you invalidate sessions.",
    ],
    howToUse: `app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);`,
    anchorId: "session-cookie-secret-generator",
    seoDescription:
      "Generate a session secret for cookie signing and server side session storage.",
  },
  {
    id: "jwt-keypair",
    title: "JWT Keypair Generator (RS256 / ES256)",
    shortTitle: "JWT keypair",
    whenToUse: "Use for asymmetric JWT signing with public verification.",
    defaultLine: "Default: ES256 (P-256) keypair.",
    kind: "keypair",
    envKeys: ["JWT_PRIVATE_KEY", "JWT_PUBLIC_KEY"],
    jsonKey: "jwtKeypair",
    supportedFormats: ["plain", "env", "json"],
    panelDescription: [
      "Generate an asymmetric keypair for RS256 or ES256.",
      "Keep the private key server side and share the public key.",
    ],
    safetyNote: "Treat the private key like a password.",
    howToUse: `const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\\\n/g, "\\n");
const token = jwt.sign(payload, privateKey, { algorithm: "ES256" });`,
    anchorId: "jwt-keypair-generator-rs256-es256",
    seoDescription:
      "Generate RS256 or ES256 JWT keypairs for public verification and safer key distribution.",
  },
  {
    id: "aes-256-gcm",
    title: "AES-256-GCM Key Generator",
    shortTitle: "AES-256-GCM key",
    whenToUse: "Use for symmetric encryption of data at rest.",
    defaultLine: "Default: 32 bytes, base64url.",
    kind: "bytes",
    defaultBytes: 32,
    strongBytes: 32,
    defaultEncoding: "base64url",
    envKeys: ["AES_256_GCM_KEY"],
    headerKey: "x-aes-256-gcm-key",
    jsonKey: "aes256GcmKey",
    supportedFormats: ["plain", "env", "json"],
    panelDescription: [
      "Raw key material for AES-256-GCM encryption.",
      "Store it in a secret manager and use a new nonce per message.",
    ],
    safetyNote: "Nonce must be unique per message.",
    howToUse: `const key = Buffer.from(process.env.AES_256_GCM_KEY, "base64url");
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);`,
    anchorId: "aes-256-gcm-key-generator",
    seoDescription:
      "Generate 32 byte keys for AES-256-GCM encryption. Always use a unique nonce.",
  },
  {
    id: "xchacha20-poly1305",
    title: "XChaCha20-Poly1305 Key Generator",
    shortTitle: "XChaCha20 key",
    whenToUse: "Use with libsodium for extended nonce encryption.",
    defaultLine: "Default: 32 bytes, base64url.",
    kind: "bytes",
    defaultBytes: 32,
    strongBytes: 32,
    defaultEncoding: "base64url",
    envKeys: ["XCHACHA20_POLY1305_KEY"],
    headerKey: "x-xchacha20-poly1305-key",
    jsonKey: "xchacha20Poly1305Key",
    supportedFormats: ["plain", "env", "json"],
    panelDescription: [
      "Raw key material for XChaCha20-Poly1305.",
      "Prefer libsodium for encryption and decryption.",
    ],
    howToUse: `const key = Buffer.from(process.env.XCHACHA20_POLY1305_KEY, "base64url");
// Use libsodium bindings to encrypt with XChaCha20-Poly1305.`,
    anchorId: "xchacha20-poly1305-key-generator",
    seoDescription:
      "Generate 32 byte keys for XChaCha20-Poly1305 using libsodium or compatible libraries.",
  },
  {
    id: "pkce",
    title: "OAuth PKCE Verifier + Challenge Generator",
    shortTitle: "OAuth PKCE",
    whenToUse: "Use for OAuth public clients and mobile apps.",
    defaultLine: "Default: verifier length 64 chars, S256 challenge.",
    kind: "pkce",
    supportedFormats: ["plain", "env", "json"],
    panelDescription: [
      "Generate a PKCE verifier and its S256 challenge.",
      "Send the challenge in the auth request and verifier on token exchange.",
    ],
    howToUse: `const { verifier, challenge } = pkce;
const url = \`\${issuer}/authorize?code_challenge=\${challenge}&code_challenge_method=S256\`;`,
    anchorId: "oauth-pkce-verifier-challenge-generator",
    seoDescription:
      "Generate a PKCE verifier and S256 challenge for OAuth authorization flows.",
  },
];

const FAQ_ITEMS = [
  {
    question: "Is this server secret generator client-side?",
    answer:
      "Yes, by default. Random tokens (API keys, webhook secrets, JWT/session secrets, encryption keys) and PKCE values are generated in your browser using Web Crypto (crypto.getRandomValues and crypto.subtle when available).",
  },
  {
    question: "When are secrets generated on the server?",
    answer:
      "Only when you enable “Server fallback” for JWT keypair generation. In that mode, the keypair is generated server-side and returned to your browser. If you need strictly client-side generation, keep Server fallback turned off.",
  },
  {
    question: "Do you store, log, or track generated secrets?",
    answer:
      "No. Generated values live only in memory on this page. We don’t persist secrets in localStorage/cookies, and we don’t intentionally send secrets in analytics payloads.",
  },
  {
    question: "Are generated secrets ever sent over the network?",
    answer:
      "Not for the default client-side generators. The only network call in this tool is the optional keypair “Server fallback”; if enabled, your browser requests a keypair and receives PEM strings in the response.",
  },
  {
    question:
      "Which preset should I use (API key vs webhook secret vs JWT vs session)?",
    answer:
      "Use “Server-to-Server (S2S) API Key” for internal service auth, “Webhook Signing Secret” for verifying provider webhooks (HMAC), “JWT Secret (HS256)” for symmetric JWT signing, “JWT Keypair (RS256/ES256)” for asymmetric JWT signing with shared public keys, and “Session / Cookie Secret” for signing cookies or server sessions.",
  },
  {
    question: "How long should an API key or webhook signing secret be?",
    answer:
      "32 random bytes (256 bits) is a strong default for API keys and HMAC webhook secrets. Use 64 bytes when you want extra margin and your integration doesn’t have length limits.",
  },
  {
    question: "base64url vs hex: which encoding should I choose?",
    answer:
      "Use base64url for most cases: it’s compact, URL-safe, and copy/paste friendly. Use hex when a library explicitly expects hex strings (note hex is longer: 32 bytes becomes 64 hex characters).",
  },
  {
    question:
      "AES-256-GCM and XChaCha20-Poly1305 keys: should I use 32 or 64 bytes?",
    answer:
      "Use 32 bytes. AES-256 and XChaCha20-Poly1305 require 256-bit (32-byte) keys. If you need to derive keys from longer secrets, use a KDF (like HKDF/scrypt/Argon2) instead of passing a 64-byte value directly as a cipher key.",
  },
  {
    question: "HS256 vs RS256 vs ES256 for JWT: which should I use?",
    answer:
      "Use HS256 only when one trusted backend both signs and verifies tokens (shared secret). Use RS256 or ES256 when multiple services need to verify tokens without sharing the private key (publish the public key).",
  },
  {
    question: "How do I store JWT PEM keys in a .env file?",
    answer:
      'Use the “.env” copy format. When reading it in Node.js, convert escaped newlines back to real newlines (for example: process.env.JWT_PRIVATE_KEY?.replace(/\\\\n/g, "\\n")).',
  },
  {
    question: "What is OAuth PKCE and where do verifier/challenge go?",
    answer:
      "PKCE protects OAuth public clients. Send the S256 code_challenge in the authorization request, and send the verifier only when exchanging the authorization code for tokens at the token endpoint.",
  },
  {
    question: "What does “Prefix” do, and is it safe?",
    answer:
      "Prefix prepends a readable label (for example: “prod_” or “api_”) to the generated random value. It’s safe as long as the random part remains long and secret; prefixes are not a security feature.",
  },
  {
    question: "What does “Alnum only” mean for session / cookie secrets?",
    answer:
      "It restricts output to letters and numbers for compatibility with strict parsers. This reduces entropy per character, so keep a long secret and prefer the default output unless you truly need compatibility mode.",
  },
  {
    question:
      "Should I commit generated secrets to Git or share them in Slack?",
    answer:
      "No. Treat generated values as credentials. Store them in a secret manager or environment variables, avoid pasting into issues/logs, and be careful when screen sharing (the output box contains real secrets).",
  },
  {
    question: "Can I use this tool offline?",
    answer:
      "After the page is loaded, generating values doesn’t require a network connection. However, offline availability depends on whether your browser has cached the page assets.",
  },
  {
    question: "Do I need to rotate secrets and keys?",
    answer:
      "Yes. Rotate long-lived secrets on a schedule and immediately after any suspected exposure. Plan for rotation (key IDs, overlapping validity windows, or dual-accept during migration) so you can rotate without downtime.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

const scenarioById = SCENARIOS.reduce<Record<ScenarioId, Scenario>>(
  (acc, scenario) => {
    acc[scenario.id] = scenario;
    return acc;
  },
  {} as Record<ScenarioId, Scenario>
);

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomString(length: number, charset: string) {
  const result: string[] = [];
  const charsetLength = charset.length;
  const max = Math.floor(256 / charsetLength) * charsetLength;
  while (result.length < length) {
    const bytes = randomBytes(length);
    for (const byte of bytes) {
      if (byte >= max) continue;
      result.push(charset[byte % charsetLength]);
      if (result.length === length) break;
    }
  }
  return result.join("");
}

function escapeEnvValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  return bytesToBase64(new Uint8Array(buffer));
}

function toPem(buffer: ArrayBuffer, label: string) {
  const base64 = arrayBufferToBase64(buffer);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function buildSingleValueOutput({
  scenario,
  value,
  format,
}: {
  scenario: Scenario;
  value: string;
  format: CopyFormat;
}) {
  if (format === "plain") return value;

  if (format === "env") {
    const keys = scenario.envKeys ?? ["SERVER_SECRET"];
    return keys.map((key) => `${key}="${escapeEnvValue(value)}"`).join("\n");
  }

  if (format === "header") {
    const headerKey = scenario.headerKey ?? "x-secret";
    return `${headerKey}: ${value}`;
  }

  const jsonKey = scenario.jsonKey ?? "secret";
  return JSON.stringify({ [jsonKey]: value }, null, 2);
}

function buildPkceOutput({
  verifier,
  challenge,
  format,
}: {
  verifier: string;
  challenge: string;
  format: CopyFormat;
}) {
  if (format === "plain") {
    return `verifier: ${verifier}\nchallenge: ${challenge}`;
  }

  if (format === "env") {
    return `PKCE_VERIFIER="${escapeEnvValue(
      verifier
    )}"\nPKCE_CHALLENGE="${escapeEnvValue(challenge)}"`;
  }

  return JSON.stringify({ verifier, challenge }, null, 2);
}

function buildKeypairOutput({
  privateKeyPem,
  publicKeyPem,
  format,
}: {
  privateKeyPem: string;
  publicKeyPem: string;
  format: CopyFormat;
}) {
  if (format === "plain") {
    return `Private key (PEM)\n${privateKeyPem}\n\nPublic key (PEM)\n${publicKeyPem}`;
  }

  if (format === "env") {
    const privateValue = escapeEnvValue(privateKeyPem);
    const publicValue = escapeEnvValue(publicKeyPem);
    return `JWT_PRIVATE_KEY="${privateValue}"\nJWT_PUBLIC_KEY="${publicValue}"`;
  }

  return JSON.stringify({ privateKeyPem, publicKeyPem }, null, 2);
}

export default function ServerSecretGeneratorTool() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("s2s");
  const [format, setFormat] = useState<CopyFormat>("plain");
  const [encoding, setEncoding] = useState<Encoding>("base64url");
  const [strength, setStrength] = useState<Strength>("default");
  const [prefixEnabled, setPrefixEnabled] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [alnumOnly, setAlnumOnly] = useState(false);
  const [keypairAlgorithm, setKeypairAlgorithm] =
    useState<KeypairAlgorithm>("ES256");
  const [useServerFallback, setUseServerFallback] = useState(false);
  const [generated, setGenerated] = useState<GeneratedData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scenario = scenarioById[scenarioId];
  const hasRandom =
    typeof window !== "undefined" && !!window.crypto?.getRandomValues;
  const hasSubtle = typeof window !== "undefined" && !!window.crypto?.subtle;

  const [quickPickValues, setQuickPickValues] = useState<
    Partial<Record<QuickPickId, string[]>>
  >({});

  const handleCopyValue = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to copy.");
    }
  }, []);

  const regenerateQuickPick = useCallback(
    (id: QuickPickId) => {
      if (!hasRandom) {
        toast.error("Web Crypto is not available in this browser.");
        return;
      }
      const spec = QUICK_PICKS.find((item) => item.id === id);
      if (!spec) return;
      setQuickPickValues((prev) => ({
        ...prev,
        [id]: generateQuickPickValues(spec),
      }));
    },
    [hasRandom]
  );

  const regenerateAllQuickPicks = useCallback(() => {
    if (!hasRandom) return;
    const next: Partial<Record<QuickPickId, string[]>> = {};
    for (const spec of QUICK_PICKS) {
      next[spec.id] = generateQuickPickValues(spec);
    }
    setQuickPickValues(next);
  }, [hasRandom]);

  useEffect(() => {
    if (scenario.defaultEncoding) {
      setEncoding(scenario.defaultEncoding);
    } else {
      setEncoding("base64url");
    }
  }, [scenarioId, scenario.defaultEncoding]);

  useEffect(() => {
    if (!scenario.supportedFormats.includes(format)) {
      setFormat(scenario.supportedFormats[0]);
    }
  }, [scenario.supportedFormats, format]);

  useEffect(() => {
    if (scenarioId !== "session") {
      setAlnumOnly(false);
    }
  }, [scenarioId]);

  const generate = useCallback(
    async (targetScenarioId?: ScenarioId) => {
      const id = targetScenarioId ?? scenarioId;
      const selectedScenario = scenarioById[id];
      setIsGenerating(true);
      setErrorMessage(null);

      try {
        if (selectedScenario.kind === "bytes") {
          if (!hasRandom) {
            throw new Error("Web Crypto is not available in this browser.");
          }
          const defaultBytes = selectedScenario.defaultBytes ?? 32;
          const strongBytes = selectedScenario.strongBytes ?? defaultBytes;
          const bytes = strength === "strong" ? strongBytes : defaultBytes;
          const rawBytes = randomBytes(bytes);
          const alnumToken =
            id === "session" && alnumOnly
              ? randomString(bytesToBase64Url(rawBytes).length, ALNUM_CHARSET)
              : undefined;
          setGenerated({ kind: "bytes", bytes: rawBytes, alnumToken });
        }

        if (selectedScenario.kind === "pkce") {
          if (!hasRandom || !hasSubtle) {
            throw new Error("Web Crypto is not available in this browser.");
          }
          const verifier = randomString(64, PKCE_CHARSET);
          const hashed = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier)
          );
          const challenge = bytesToBase64Url(new Uint8Array(hashed));
          setGenerated({ kind: "pkce", verifier, challenge });
        }

        if (selectedScenario.kind === "keypair") {
          if (useServerFallback) {
            const payload = await generateKeypairAction(keypairAlgorithm);
            setGenerated({
              kind: "keypair",
              privateKeyPem: payload.privateKeyPem,
              publicKeyPem: payload.publicKeyPem,
            });
          } else {
            if (!hasSubtle) {
              throw new Error("Keypair generation is not supported here.");
            }
            const keypair =
              keypairAlgorithm === "ES256"
                ? await crypto.subtle.generateKey(
                    { name: "ECDSA", namedCurve: "P-256" },
                    true,
                    ["sign", "verify"]
                  )
                : await crypto.subtle.generateKey(
                    {
                      name: "RSASSA-PKCS1-v1_5",
                      modulusLength: 2048,
                      publicExponent: new Uint8Array([1, 0, 1]),
                      hash: "SHA-256",
                    },
                    true,
                    ["sign", "verify"]
                  );

            const [privateKey, publicKey] = await Promise.all([
              crypto.subtle.exportKey("pkcs8", keypair.privateKey),
              crypto.subtle.exportKey("spki", keypair.publicKey),
            ]);

            setGenerated({
              kind: "keypair",
              privateKeyPem: toPem(privateKey, "PRIVATE KEY"),
              publicKeyPem: toPem(publicKey, "PUBLIC KEY"),
            });
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate secret.";
        setErrorMessage(message);
        setGenerated(null);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      scenarioId,
      strength,
      alnumOnly,
      keypairAlgorithm,
      useServerFallback,
      hasRandom,
      hasSubtle,
    ]
  );

  useEffect(() => {
    void generate();
  }, [generate]);

  useEffect(() => {
    regenerateAllQuickPicks();
  }, [regenerateAllQuickPicks]);

  const outputValue = useMemo(() => {
    if (!generated) return "";

    if (generated.kind === "bytes") {
      const baseValue =
        scenarioId === "session" && alnumOnly && generated.alnumToken
          ? generated.alnumToken
          : encoding === "hex"
            ? bytesToHex(generated.bytes)
            : bytesToBase64Url(generated.bytes);
      const prefixedValue =
        prefixEnabled && prefix.trim().length > 0
          ? `${prefix}${baseValue}`
          : baseValue;
      return buildSingleValueOutput({
        scenario,
        value: prefixedValue,
        format,
      });
    }

    if (generated.kind === "pkce") {
      return buildPkceOutput({
        verifier: generated.verifier,
        challenge: generated.challenge,
        format,
      });
    }

    return buildKeypairOutput({
      privateKeyPem: generated.privateKeyPem,
      publicKeyPem: generated.publicKeyPem,
      format,
    });
  }, [
    generated,
    scenario,
    format,
    encoding,
    prefixEnabled,
    prefix,
    alnumOnly,
    scenarioId,
  ]);

  const outputRows = useMemo(() => {
    const lines = outputValue.split("\n").length;
    return Math.min(12, Math.max(3, lines));
  }, [outputValue]);

  const handleCopy = useCallback(async () => {
    if (!outputValue) return;
    try {
      await navigator.clipboard.writeText(outputValue);
      toast.success("Copied to clipboard.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to copy.");
    }
  }, [outputValue]);

  const handleGenerateClick = useCallback(
    async (id: ScenarioId) => {
      setScenarioId(id);
      await generate(id);
      document.getElementById("generator-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [generate]
  );

  const showStrength =
    scenario.kind === "bytes" &&
    (scenario.strongBytes ?? scenario.defaultBytes ?? 0) >
      (scenario.defaultBytes ?? 0);
  const showEncoding =
    scenario.kind === "bytes" && !(scenarioId === "session" && alnumOnly);
  const showPrefix = scenario.kind === "bytes";
  const showAlnum = scenarioId === "session" && scenario.kind === "bytes";

  return (
    <div className="container mx-auto px-4 pt-24 md:pt-28 xl:pt-32 pb-24 md:pb-32">
      <section className="max-w-4xl">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Client-side</Badge>
            <Badge variant="secondary">Unlimited</Badge>
            <Badge variant="secondary">No signup</Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Server Secret Generator
          </h1>
          <p className="text-muted-foreground text-base md:text-lg">
            Generate secure server keys for S2S APIs, webhooks, JWT, sessions,
            encryption, and PKCE.
          </p>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Unlimited | No signup | Client-side by default
          </p>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Quick picks
            </h2>
            <p className="text-sm text-muted-foreground">
              Auto-generated secrets. Refresh until you find one you like, then
              copy.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={regenerateAllQuickPicks}
            disabled={!hasRandom}
          >
            <RefreshCwIcon className="size-4" />
            Refresh all
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {QUICK_PICKS.map((spec) => {
            const values = quickPickValues[spec.id] ?? [];
            const bits = spec.bytes * 8;

            return (
              <Card key={spec.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-medium">
                          {spec.title}
                          <span
                            aria-hidden="true"
                            className="ml-1 text-muted-foreground"
                          >
                            &gt;
                          </span>
                        </CardTitle>
                        <Badge variant="secondary">{bits}b</Badge>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => regenerateQuickPick(spec.id)}
                      disabled={!hasRandom}
                      aria-label={`Refresh ${spec.title}`}
                    >
                      <RefreshCwIcon className="size-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div
                    className={
                      spec.layout === "grid2"
                        ? "grid grid-cols-2 gap-3"
                        : "grid gap-3"
                    }
                  >
                    {(values.length > 0
                      ? values
                      : Array.from({ length: spec.count }, () => "")
                    ).map((value, idx) => {
                      const isPlaceholder = value.length === 0;
                      return (
                        <div
                          key={`${spec.id}-${idx}`}
                          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className={
                                isPlaceholder
                                  ? "h-5 w-full animate-pulse rounded bg-muted"
                                  : "font-mono text-sm truncate"
                              }
                              title={isPlaceholder ? undefined : value}
                            >
                              {isPlaceholder ? "" : value}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => void handleCopyValue(value)}
                            disabled={isPlaceholder}
                            aria-label={`Copy ${spec.title} value`}
                          >
                            <CopyIcon className="size-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCENARIOS.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-2">
                  <a
                    href={`#${item.anchorId}`}
                    className="text-base font-semibold hover:underline"
                  >
                    {item.title}
                  </a>
                  <CardDescription>{item.whenToUse}</CardDescription>
                </div>
                <Badge variant="outline" className="w-fit">
                  {item.defaultLine}
                </Badge>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => void handleGenerateClick(item.id)}
                >
                  Generate
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="generator-panel" className="mt-12 scroll-mt-24">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-2">
              <CardTitle className="text-xl">{scenario.title}</CardTitle>
              {scenario.panelDescription.map((line) => (
                <CardDescription key={line}>{line}</CardDescription>
              ))}
            </div>
            <Badge variant="outline" className="w-fit">
              {scenario.defaultLine}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Main output</Label>
                <Textarea
                  readOnly
                  rows={outputRows}
                  value={outputValue}
                  className="font-mono text-sm"
                  placeholder="Generate a secret to see output here."
                />
                {errorMessage && (
                  <p className="text-sm text-destructive">{errorMessage}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleCopy} disabled={!outputValue}>
                  <CopyIcon className="size-4" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void generate()}
                  disabled={isGenerating || !hasRandom}
                >
                  <RefreshCwIcon className="size-4" />
                  Regenerate
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Copy format</Label>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_OPTIONS.map((option) => {
                    const isSupported = scenario.supportedFormats.includes(
                      option.id
                    );
                    return (
                      <Button
                        key={option.id}
                        size="sm"
                        variant={format === option.id ? "default" : "outline"}
                        disabled={!isSupported}
                        onClick={() => setFormat(option.id)}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {scenario.safetyNote && (
                <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-900">
                  {scenario.safetyNote}
                </div>
              )}
            </div>

            <div className="space-y-6">
              {showStrength && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label>Stronger</Label>
                    <p className="text-xs text-muted-foreground">
                      Use {scenario.strongBytes ?? 64} bytes instead of{" "}
                      {scenario.defaultBytes ?? 32}.
                    </p>
                  </div>
                  <Switch
                    checked={strength === "strong"}
                    onCheckedChange={(checked) =>
                      setStrength(checked ? "strong" : "default")
                    }
                  />
                </div>
              )}

              <details className="rounded-md border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Advanced options
                </summary>
                <div className="mt-4 space-y-4">
                  {showEncoding && (
                    <div className="space-y-2">
                      <Label>Encoding</Label>
                      <div className="flex flex-wrap gap-2">
                        {ENCODING_OPTIONS.map((option) => (
                          <Button
                            key={option.id}
                            size="sm"
                            variant={
                              encoding === option.id ? "default" : "outline"
                            }
                            onClick={() => setEncoding(option.id)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showPrefix && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Prefix</Label>
                        <Switch
                          checked={prefixEnabled}
                          onCheckedChange={setPrefixEnabled}
                        />
                      </div>
                      <Input
                        value={prefix}
                        onChange={(event) => setPrefix(event.target.value)}
                        placeholder="Optional prefix"
                        disabled={!prefixEnabled}
                      />
                    </div>
                  )}

                  {showAlnum && (
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <Label>Alnum only</Label>
                        <p className="text-xs text-muted-foreground">
                          Compatibility mode for strict parsers.
                        </p>
                      </div>
                      <Switch
                        checked={alnumOnly}
                        onCheckedChange={setAlnumOnly}
                      />
                    </div>
                  )}

                  {scenario.kind === "keypair" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Keypair algorithm</Label>
                        <div className="flex flex-wrap gap-2">
                          {KEYPAIR_OPTIONS.map((option) => (
                            <Button
                              key={option.id}
                              size="sm"
                              variant={
                                keypairAlgorithm === option.id
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => setKeypairAlgorithm(option.id)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {KEYPAIR_OPTIONS.find(
                            (option) => option.id === keypairAlgorithm
                          )?.hint ?? ""}
                        </p>
                      </div>
                      <div className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <Label>Server fallback</Label>
                          <p className="text-xs text-muted-foreground">
                            Use only if your browser cannot export keys.
                          </p>
                        </div>
                        <Switch
                          checked={useServerFallback}
                          onCheckedChange={setUseServerFallback}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-12">
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            How to use (Node.js)
          </summary>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              {scenario.whenToUse} The generator is already configured to this
              preset.
            </p>
            <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto">
              <code>{scenario.howToUse}</code>
            </pre>
          </div>
        </details>
      </section>

      <section className="mt-12 space-y-8">
        {SCENARIOS.map((item) => (
          <div
            key={item.id}
            id={item.anchorId}
            className="scroll-mt-24 space-y-2"
          >
            <h2 className="text-xl font-semibold">{item.title}</h2>
            <p className="text-sm text-muted-foreground">
              {item.seoDescription}
            </p>
            <p className="text-xs text-muted-foreground">{item.defaultLine}</p>
          </div>
        ))}
      </section>

      <section className="mt-12 rounded-md border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Security notes</h2>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>- Client-side generation uses crypto.getRandomValues.</li>
          <li>- No localStorage, cookies, or persistence.</li>
          <li>- Server fallback responses are no-store when used.</li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">FAQ</h2>
        <div className="mt-4 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="rounded-md border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {item.question}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12 text-sm text-muted-foreground space-y-1">
        <p>Generated locally using Web Crypto when possible.</p>
        <p>No secrets stored.</p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
    </div>
  );
}
