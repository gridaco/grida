import {
  react_presets,
  flutter_presets,
  vanilla_presets,
} from "@grida/builder-config-preset";
import { ParsedUrlQuery } from "querystring";
import { FrameworkConfig } from "@designto/config";

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
      return react_presets.react_with_styled_components;
    case "react-with-emotion-styled":
      return react_presets.react_with_emotion_styled;
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
