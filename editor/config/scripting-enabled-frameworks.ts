import type { FrameworkConfig } from "@designto/config";

type Framework = FrameworkConfig["framework"];

interface FrameworkEditorSciprtingPreviewConfig {
  nativePreview: boolean;
  nativeScripting: boolean;
  enabled: boolean;
}

/**
 * a config map by frameworks containing supported scripting and preview features.
 */
export const scripting_and_preview_framework_config: {
  [key in Framework]: FrameworkEditorSciprtingPreviewConfig;
} = {
  vanilla: {
    nativePreview: true,
    nativeScripting: true,
    enabled: true,
  },
  react: {
    nativePreview: true,
    nativeScripting: true,
    enabled: true,
  },
  "react-native": {
    nativePreview: false,
    nativeScripting: false,
    enabled: false,
  },
  flutter: {
    nativePreview: true,
    nativeScripting: true,
    enabled: true,
  },
  "solid-js": {
    nativePreview: false,
    nativeScripting: false,
    enabled: false,
  },
  preview: null,
} as const;

export function supportsScripting(framework: Framework) {
  return scripting_and_preview_framework_config[framework].nativeScripting;
}

export function supportsPreview(framework: Framework) {
  return scripting_and_preview_framework_config[framework].nativePreview;
}
