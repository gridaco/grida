import { Framework } from "@grida/builder-platform-types";

export enum Language {
  jsx = "jsx",
  tsx = "tsx",
  dart = "dart",
  html = "html",
}

export type ReactStylingStrategy =
  | "css"
  | "styled-components"
  | "inline-css"
  | "css-module";

export type ReactNativeStylingStrategy =
  | "style-sheet"
  | "styled-components"
  | "inline-style";

export type SolidStylingStrategy =
  | "css"
  //
  | "styled-components"
  | "inline-css";

export interface FlutterOption {
  framework: Framework.flutter;
  language: Language.dart;
}

export interface ReactOption {
  framework: Framework.react;
  language: Language.jsx | Language.tsx;
  styling: ReactStylingStrategy;
}

export interface ReactNativeOption {
  framework: Framework.reactnative;
  language: Language.jsx | Language.tsx;
  styling: ReactNativeStylingStrategy;
}

export interface SolidOption {
  framework: Framework.solid;
  language: Language.jsx | Language.tsx;
  styling: SolidStylingStrategy;
}

export interface VanillaOption {
  framework: Framework.vanilla;
  language: Language.html;
}

export type FrameworkOption =
  | ReactOption
  | ReactNativeOption
  | FlutterOption
  | SolidOption
  | VanillaOption;

export const react_presets = {
  react_default: <ReactOption>{
    framework: Framework.react,
    language: Language.tsx,
    styling: "styled-components",
  },
  react_with_styled_components: <ReactOption>{
    framework: Framework.react,
    language: Language.tsx,
    styling: "styled-components",
  },
  react_with_inline_css: <ReactOption>{
    framework: Framework.react,
    language: Language.tsx,
    styling: "inline-css",
  },
  react_with_css_module: <ReactOption>{
    framework: Framework.react,
    language: Language.tsx,
    styling: "css-module",
  },
  react_with_css: <ReactOption>{
    framework: Framework.react,
    language: Language.tsx,
    styling: "css",
  },
};

export const reactnative_presets = {
  reactnative_default: <ReactNativeOption>{
    framework: Framework.reactnative,
    language: Language.tsx,
    styling: "style-sheet",
  },
  reactnative_with_styled_components: <ReactNativeOption>{
    framework: Framework.reactnative,
    language: Language.tsx,
    styling: "styled-components",
  },
  reactnative_with_inline_style: <ReactNativeOption>{
    framework: Framework.reactnative,
    language: Language.tsx,
    styling: "inline-style",
  },
};

export const flutter_presets = {
  flutter_default: <FlutterOption>{
    framework: Framework.flutter,
    language: Language.dart,
  },
};

export const solid_presets = {
  solid_default: <SolidOption>{
    framework: Framework.solid,
    language: Language.tsx,
    styling: "styled-components",
  },
  solid_with_styled_components: <SolidOption>{
    framework: Framework.solid,
    language: Language.tsx,
    styling: "styled-components",
  },
  solid_with_inline_css: <SolidOption>{
    framework: Framework.solid,
    language: Language.tsx,
    styling: "inline-css",
  },
};

export const vanilla_presets = {
  vanilla_default: <VanillaOption>{
    framework: Framework.vanilla,
    language: Language.html,
  },
};

export const presets = {
  react: react_presets,
  reactnative: reactnative_presets,
  flutter: flutter_presets,
  vanilla: vanilla_presets,
  solid: solid_presets,
};

export const all_preset_options__prod = [
  flutter_presets.flutter_default,
  react_presets.react_default,
  react_presets.react_with_styled_components,
  react_presets.react_with_inline_css,
  react_presets.react_with_css_module,
  reactnative_presets.reactnative_default,
  vanilla_presets.vanilla_default,
  solid_presets.solid_default,
  // react_with_css // NOT ON PRODUCTION
];

export const all_preset_options_map__prod = {
  none: null,
  flutter: flutter_presets.flutter_default,
  flutter_default: flutter_presets.flutter_default,
  react: react_presets.react_default,
  react_default: react_presets.react_default,
  react_with_styled_components: react_presets.react_with_styled_components,
  react_with_inline_css: react_presets.react_with_inline_css,
  react_with_css_module: react_presets.react_with_css_module,
  "react-native": reactnative_presets.reactnative_default,
  reactnative: reactnative_presets.reactnative_default,
  reactnative_default: reactnative_presets.reactnative_default,
  reactnative_with_styled_components:
    reactnative_presets.reactnative_with_styled_components,
  reactnative_with_inline_style:
    reactnative_presets.reactnative_with_inline_style,
  vanilla: vanilla_presets.vanilla_default,
  vanilla_default: vanilla_presets.vanilla_default,
  solid: solid_presets.solid_default,
  "solid-js": solid_presets.solid_default,
  solid_default: solid_presets.solid_default,
  solid_with_inline_css: solid_presets.solid_with_inline_css,
  solid_with_styled_components: solid_presets.solid_with_styled_components,
  // react_with_css // NOT ON PRODUCTION
};

export const lang_by_framework = {
  flutter: [Language.dart],
  react: [Language.jsx, Language.tsx],
  "react-native": [Language.jsx, Language.tsx],
  "solid-js": [Language.jsx, Language.tsx],
  vanilla: [Language.html],
};

export const react_styles: ReactStylingStrategy[] = [
  "styled-components",
  "inline-css",
  "css-module",
  "css",
];

export const getpreset = (preset_name: string): FrameworkOption => {
  const _p = all_preset_options_map__prod[preset_name];
  if (_p) {
    return _p;
  }
  throw `"${preset_name}" is not a valid platform preset key`;
};

export const getDefaultPresetNameByFramework = (frameowrk: Framework) => {
  switch (frameowrk) {
    case Framework.flutter:
      return "flutter_default";
    case Framework.react:
      return "react_default";
    case Framework.reactnative:
      return "reactnative_default";
    case Framework.vanilla:
      return "vanilla_default";
  }
};

export const getDefaultPresetByFramework = (frameowrk: Framework) => {
  return getPresetByName(getDefaultPresetNameByFramework(frameowrk));
};

export function getPresetByName(name: string) {
  return all_preset_options_map__prod[name];
}
