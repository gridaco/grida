import { DesignProvider } from "@design-sdk/core-types";

export class RecentDesignsStore {
  constructor() {}
  add(design) {}
  load(): RecentDesign[] {
    return [] as RecentDesign[];
  }
}

/**
 * interface for holding the recent designs.
 * @interface
 * @name RecentDesign
 **/
export interface RecentDesign {
  id: string;
  provider: DesignProvider;
  name: string;
  addedAt: Date;
  lastUpdatedAt: Date;
  previewUrl: string;
}
