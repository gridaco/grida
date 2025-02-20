export { Appbar as EditorAppbar } from "./editor-appbar";

import { AppbarFragmentForSidebar } from "./editor-appbar-fragment-for-sidebar";
import { AppbarFragmentForCanvas } from "./editor-appbar-fragment-for-canvas";
import { AppbarFragmentForRightSidebar } from "./editor-appbar-fragment-for-code-editor";

export const EditorAppbarFragments = {
  Sidebar: AppbarFragmentForSidebar,
  Canvas: AppbarFragmentForCanvas,
  RightSidebar: AppbarFragmentForRightSidebar,
};
