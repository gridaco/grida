import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { ComponentNode } from "@design-sdk/figma";

export interface DashboardState {
  selection: Array<string>;
  hierarchy: DashboardHierarchy;
  hierarchyFoldings: ReadonlyArray<string>;
  filter: DashboardFilter;
}

export interface DashboardHierarchy {
  sections: Array<DashboardFolderItem>;
  components: Array<SceneItem>;
}

export interface DashboardFilter {
  query?: string;
}

export type DashboardItem = DashboardFolderItem | SceneItem;

export type DashboardFolderItem = {
  id: string;
  $type: "folder";
  path: string;
  name: string;
  contents: Array<DashboardItem>;
};

export type SceneItem = FrameSceneItem | ComponentItem | GroupedSceneItem;
export type SceneItemType = SceneItem["$type"];

export type FrameSceneItem = {
  $type: "frame-scene";
  id: string;
  name: string;
  path: string;
  type: "FRAME";
  width: number;
  height: number;
  scene: ReflectSceneNode;
};

/**
 * Can be either scene that are merged as variant set or originally variant set
 */
export type VariantItem = GroupedSceneItem;

export type GroupedSceneItem = {
  $type: "grouped";
  id: string;
  path: string;
  name: string;
  type: "FRAME";
  scene: ReflectSceneNode;
  alias: Array<FrameSceneItem>;
};

export type ComponentItem = {
  $type: "component";
  id: string;
  name: string;
  path: string;
  type: "COMPONENT";
  scene: ComponentNode & { filekey: string };
  width: number;
  height: number;
};

// export abstract class UndecudedNane {
//   constructor(public readonly name: string) {}
// }

// /**
//  * this class is an utility class for telling the view that it should initially trigger the name editing state.
//  * It's used instead of a symbol so that it can contain the initial value.
//  */
// export class UndecidedFolderName extends UndecudedNane {}
