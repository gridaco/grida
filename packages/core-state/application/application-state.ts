import { PageReference } from "@core/model";

export interface ApplicationState {
  selectedPage: string;
  selectedObjects: string[];
  pages: PageReference[];
}

export interface ApplicationSnapshot {
  selectedPage: string;
  selectedObjects: string[];
  pages: PageReference[];
}
