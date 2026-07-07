import { app } from "electron";

export const IS_INSIDERS = INSIDERS === 1;
// Use Electron's own packaging signal — `app.isPackaged` is true only
// when running from a packaged .app/.exe, false under
// `electron-forge start`. Neither `process.env.NODE_ENV` nor
// `import.meta.env.DEV` work here: Forge's Vite plugin builds main.ts
// in production mode regardless of whether Forge is doing `start`,
// `package`, or `make`, so both signals are inlined as "production" /
// `false` and `pnpm dev` ended up loading grida.co.
export const IS_DEV = !app.isPackaged;
// Insiders builds (and dev) target the local editor; everything else hits
// production. The dev signal moved from NODE_ENV to `app.isPackaged` (see
// above), but the `IS_INSIDERS` term must remain part of this decision —
// dropping it would silently route an insiders build at grida.co.
export const EDITOR_BASE_URL =
  IS_INSIDERS || IS_DEV ? "http://localhost:3000" : "https://grida.co";

// GRIDA-SEC-005 / #955 — the custom URL scheme THIS build registers as its
// `…://auth/callback` deep-link handler. Local builds (dev + insiders, which
// target the localhost editor) use `grida-dev`; production uses `grida`. Split
// so a dev machine that ALSO runs the packaged production Grida (which owns
// `grida://`) doesn't have the two builds fight over one scheme — macOS
// LaunchServices resolves a scheme to a single default handler, so distinct
// schemes are the only durable isolation. Mirrors the EDITOR_BASE_URL local/prod
// split exactly, so the desktop's registered scheme and the editor's redirect
// target (editor/lib/desktop/auth-deeplink.ts) always agree.
export const DEEP_LINK_SCHEME = IS_INSIDERS || IS_DEV ? "grida-dev" : "grida";
