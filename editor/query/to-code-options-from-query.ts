import {
  react_presets,
  reactnative_presets,
  flutter_presets,
  vanilla_presets,
  solid_presets,
} from "@grida/builder-config-preset";
import { ParsedUrlQuery } from "querystring";
import { FrameworkConfig } from "@grida/builder-config";

export function get_enable_components_config_from_query(
  query: ParsedUrlQuery
): boolean {
  const enable_components = query["components"];
  if (enable_components) {
    return enable_components === "true";
  }
  // disabled by default
  return false;
}

export function get_framework_config_from_query(query: ParsedUrlQuery) {
  const framework = query.framework as string;
  return get_framework_config(framework);
}

export function get_framework_config(framework: string) {
  switch (framework) {
    case "react":
    case "react_default":
    case "react-default":
    case "react.default":
      return react_presets.react_default;
    case "react-with-styled-components":
    case "react_with_styled_components":
      return react_presets.react_with_styled_components;
    case "react-with-emotion-styled":
      return react_presets.react_with_emotion_styled;
    case "react_with_inline_css":
    case "react-with-inline-css":
      return react_presets.react_with_inline_css;
    case "react_with_css_module":
    case "react-with-css-module":
      return react_presets.react_with_css_module;
    case "react-native":
      return reactnative_presets.reactnative_default;
    case "react-native-with-style-sheet":
      return reactnative_presets.reactnative_with_style_sheet;
    case "react-native-with-styled-components":
      return reactnative_presets.reactnative_with_styled_components;
    case "react-native-with-inline-style":
      return reactnative_presets.reactnative_with_inline_style;
    case "solid_with_styled_components":
    case "solid-with-styled-components":
      return solid_presets.solid_with_styled_components;
    case "solid_with_inline_css":
    case "solid-with-inline-css":
      return solid_presets.solid_with_inline_css;
    case "flutter":
    case "flutter_default":
    case "flutter-default":
    case "flutter.default":
      return flutter_presets.flutter_default;
    case "vanilla":
    case "vanilla-default":
    case "vanilla.default":
      return vanilla_presets.vanilla_default;
    default:
      console.warn(
        'no matching framework preset found for "' + framework + '"',
        "fallback to react preset"
      );
      return react_presets.react_default;
  }
}

export function get_preview_runner_framework(query: ParsedUrlQuery) {
  const preview = (query.preview as string) ?? "vanilla"; // make vanilla as default preview if non provided.
  return get_framework_config(
    preview || get_framework_config_from_query(query).framework
  );
}

export function get_runner_platform(config: FrameworkConfig) {
  switch (config.framework) {
    case "react":
      return "react";
    case "flutter":
      return "flutter";
    case "flutter":
      return "flutter";
    case "vanilla":
      return "vanilla";
    default:
      return "vanilla";
  }
}
