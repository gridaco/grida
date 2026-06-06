// Real-world SVGs for the live-editor playground bento. Each is path-based so a
// tile can open straight into path-edit mode with its vertices on display — the
// clearest "this is real, editable SVG" cue (grida is the exception: selectOnly).
// Colors are each artwork's own; theme-adaptive contrast isn't guaranteed
// (grida uses currentColor; the others carry literal fills).

import illustration from "./playground-illustration";
import artwork from "@/app/(canvas)/svg/_fixtures/artwork";

export type PlaygroundFixture = {
  label: string;
  svg: string;
  /** Open in plain selection instead of path-edit mode. */
  selectOnly?: boolean;
};

// The Grida brand symbol (from components/grida-logo) — kept monochrome
// (currentColor → foreground), exactly as the logo renders everywhere. Main
// body path first so path-edit lands on the richer curve.
const grida = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 42">
  <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M26.02 7.17866C19.0948 7.95373 13.7111 13.8284 13.7111 20.9606V27.5797L13.9475 42L0 28.3677V13.8687V13.7899L0.000217973 13.7901C0.042516 6.16679 6.23543 0 13.8687 0C19.1022 0 23.6587 2.89894 26.02 7.17866Z" />
  <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M27.6584 13.8687L27.5796 28.2889L41.5271 41.9212V27.7373V27.5009L41.525 27.4989C41.3978 19.9495 35.2382 13.8687 27.6584 13.8687Z" />
</svg>`;

// A heart icon as a single filled path.
const heart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#F43F5E" />
</svg>`;

// Big 2×2 = artwork placeholder (swap for the incoming 1:1 illustration),
// wide 2×1 = leopard illustration, then heart + grida as 1×1 units.
export const PLAYGROUND_FIXTURES: PlaygroundFixture[] = [
  { label: "artwork", svg: artwork },
  { label: "illustration", svg: illustration },
  { label: "heart", svg: heart },
  { label: "grida", svg: grida, selectOnly: true },
];
