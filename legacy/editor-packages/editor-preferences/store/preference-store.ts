import type { PreferenceState } from "../core";

const _IS_DEV = process.env.NODE_ENV === "development";

/**
 * you can enable this by default on your .env.local file
 *
 * ```.env.local
 * NEXT_PUBLIC_ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT=true
 * ```
 */
const _ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT =
  process.env.NEXT_PUBLIC_ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT === "true";

import { react_presets } from "@grida/builder-config-preset";

type Preferences = PreferenceState["config"];

const default_pref: Preferences = {
  debug: _IS_DEV,
  canvas: {
    renderer: "bitmap-renderer" as const,
  },
  experimental: {
    preview_feature_components_support:
      _ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT ? "enabled" : "disabled",
  },
  framework: react_presets.react_default,
  theme: "dark",
};

export class PreferencesStore {
  readonly key: string;
  constructor(ws?: string) {
    this.key = "code.grida.co/preferences-" + ws ?? "default";
  }

  enable_preview_feature_components_support(
    b: Preferences["experimental"]["preview_feature_components_support"]
  ) {
    const pf = this.load();
    pf.experimental.preview_feature_components_support = b;
    this.set(pf);
    return pf;
  }

  debug_mode(b: boolean) {
    const pf = this.load();
    pf.debug = b;
    this.set(pf);
    return pf;
  }

  set(pf: Preferences) {
    // ssr
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(this.key, JSON.stringify(pf));
  }

  load(): Preferences {
    // ssr
    if (typeof window === "undefined") {
      return default_pref;
    }

    const pl = window.localStorage.getItem(this.key);
    if (!pl) {
      return default_pref;
    }
    return JSON.parse(pl) as Preferences;
  }
}
