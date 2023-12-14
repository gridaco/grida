import {
  FLUTTER_COMPONENT_FULL_SOURCE,
  REACT_TSX_STYLED_COMPONENTS_SOURCE,
  HTML_COMPONENT_FULL_SOURCE,
} from "./snippets";

export interface DevFrameworkDemoConfig {
  name: string;
  lang: string;
  source: string;
}

export const DEFAULT_DEMO_ITEM = {
  name: "react",
  lang: "tsx",
  source: REACT_TSX_STYLED_COMPONENTS_SOURCE,
};

export const DEV_FRAMEWORKS: DevFrameworkDemoConfig[] = [
  DEFAULT_DEMO_ITEM,
  {
    name: "flutter",
    lang: "dart",
    source: FLUTTER_COMPONENT_FULL_SOURCE,
  },
  {
    name: "html",
    lang: "html",
    source: HTML_COMPONENT_FULL_SOURCE,
  },
  // {
  //   name: "svelte",
  //   lang: "svelte",
  //   source: REACT_TSX_STYLED_COMPONENTS_SOURCE,
  // },
];
