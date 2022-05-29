import { isSameDesignUrl } from "@design-sdk/figma-url";
import { DemoDesignSnapshot } from "./demo-types";
import {
  _DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_SNAPSHOT,
  _DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_URL,
} from "./nwv-demo";

const __figma_demo_designs: DemoDesignSnapshot[] = [
  _DEMO_NWV_MAIN_PAGE_DESIGN_FIGMA_SNAPSHOT,
];

export function isOneOfDemoDesignUrl(url: string) {
  return __isOneOfDemoDesignUrl__figma(url) || isOneOfSketchDemoDesignUrl(url);
}

export function __isOneOfDemoDesignUrl__figma(url: string): boolean {
  return __figma_demo_designs.some((d) => {
    return isSameDesignUrl(url, d.url);
  });
}

export function isOneOfSketchDemoDesignUrl(url: string): boolean {
  return false; // TODO:
}

export function loadDemoDesign(url: string) {
  return __loadDemoDesign__figma(url);
  // TODO: add other providers
}

export function __loadDemoDesign__figma(url: string): DemoDesignSnapshot {
  return __figma_demo_designs.find((d) => d.url === url)!;
}
