"use client";

import { fig2grida } from "@grida/io-figma/fig2grida-core";
import type iofigma from "@grida/io-figma";
import { useEmbedViewer, type FileConverter } from "./use-embed-viewer";

/**
 * Renderer configuration for the refig embed canvas.
 *
 * These flags are applied to the WASM renderer after mount, before any
 * document is loaded.
 */
interface RefigRenderConfig extends Pick<
  iofigma.restful.factory.FactoryContext,
  "prefer_fixed_text_sizing"
> {
  /**
   * Skip the flexbox layout engine during scene loading.
   */
  cg_skip_layout: boolean;
}

const REFIG_RENDER_CONFIG: RefigRenderConfig = {
  cg_skip_layout: false,
};

/**
 * Create a fig2grida converter function with the refig render config.
 */
function createFigmaConverter(): FileConverter {
  return (input: Uint8Array | object) => {
    return fig2grida(input, {
      placeholder_for_missing_images: false,
      preserve_figma_ids: true,
      prefer_fixed_text_sizing: REFIG_RENDER_CONFIG.prefer_fixed_text_sizing,
    });
  };
}

const figmaConverter = createFigmaConverter();

/**
 * Figma-specific embed viewer hook.
 *
 * Thin wrapper around {@link useEmbedViewer} that plugs in the fig2grida
 * converter. Supports all native Grida formats (.grida, .grida1) plus Figma
 * formats (.fig, .json, .json.gz, .zip).
 */
export function useRefigEditor() {
  return useEmbedViewer({
    converter: figmaConverter,
    renderConfig: {
      cg_skip_layout: REFIG_RENDER_CONFIG.cg_skip_layout,
    },
  });
}

/**
 * Regex that matches the synthetic suffixes appended by io-figma when
 * `prefer_path_for_geometry` is true and fill/stroke geometries are
 * decomposed into child nodes.
 *
 * Patterns:
 * - `{figmaId}_fill_{N}`    — fill geometry child
 * - `{figmaId}_stroke_{N}`  — stroke geometry child
 */
const SYNTHETIC_SUFFIX_RE = /_(fill|stroke)_\d+$/;

/**
 * Regex for instance-clone IDs: `{prefix}::{counter}::{originalId}`.
 * The `::` separator is unique to clone IDs (never appears in Figma node IDs).
 * Captures the trailing original Figma ID after the last `::`.
 */
const INSTANCE_CLONE_RE = /^.+?::\d+::(.+)$/;

/**
 * Decode a Grida node ID that may contain synthetic suffixes back to the
 * closest real Figma node ID. This is refig-specific logic and should only
 * be used in the embed/refig context where `preserve_figma_ids` is true.
 *
 * - `"42:17"` → `"42:17"` (real node, unchanged)
 * - `"42:17_fill_0"` → `"42:17"` (synthetic fill child → parent)
 * - `"42:17_stroke_1"` → `"42:17"` (synthetic stroke child → parent)
 * - `"42:17::0::5:3"` → `"5:3"` (instance clone → original)
 * - `"42:17::0::5:3_fill_0"` → `"5:3"` (instance clone + synthetic → original)
 * - `"scene-1"` → `"scene-1"` (non-Figma ID, unchanged)
 */
export function decodeSyntheticFigmaId(id: string): string {
  let decoded = id;

  // Strip instance-clone prefix: `{prefix}::{counter}::{originalId}` → `{originalId}`
  // The `::` delimiter never appears in Figma IDs, so its presence is
  // unambiguous. We take everything after the last `::`.
  const cloneMatch = decoded.match(INSTANCE_CLONE_RE);
  if (cloneMatch) {
    decoded = cloneMatch[1];
  }

  // Strip synthetic geometry suffix
  decoded = decoded.replace(SYNTHETIC_SUFFIX_RE, "");

  return decoded;
}

import { validateExt as _validateExt } from "./use-embed-viewer";

/**
 * Validate a filename for refig (Figma + native formats).
 * Accepts `.fig`, `.deck`, `.json`, `.json.gz`, `.zip`, `.grida`, `.grida1`.
 */
export function validateExt(name: string): boolean {
  return _validateExt(name, /* hasConverter */ true);
}
