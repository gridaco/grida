export interface DashboardState {
  selection: Array<string>;
  hierarchy: DashboardHierarchy;
  filter: DashboardFilter;
}

export interface DashboardHierarchy {
  sections: Array<DashboardSection>;
  components: Array<SceneItem>;
}

export interface DashboardFilter {
  query: string;
}

export interface DashboardSection {
  name: string;
  items: Array<DashboardItem>;
}

export type DashboardItem = DashboardFolderItem | SceneItem;

export type DashboardFolderItem = {
  id: string;
  type: "folder";
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
  type: "FRAME";
  width: number;
  height: number;
};

/**
 * Can be either scene that are merged as variant set or originally variant set
 */
export type VariantItem = GroupedSceneItem;

export type GroupedSceneItem = {
  id: string;
  name: string;
  type: "FRAME";
  $type: "grouped";
  scenes: Array<FrameSceneItem>;
};

export type ComponentItem = {
  $type: "component";
  id: string;
  name: string;
  type: "COMPONENT";
  width: number;
  height: number;
};
