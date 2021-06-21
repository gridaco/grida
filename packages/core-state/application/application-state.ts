import { Page } from "../page/page-model";

export type ApplicationState = {
  selectedPage: string;
  selectedObjects: string[];
  pages: Page[];
};
