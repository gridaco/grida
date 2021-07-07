import { Page } from "@core/model";

export type ApplicationState = {
  selectedPage: string;
  selectedObjects: string[];
  pages: Page[];
};
