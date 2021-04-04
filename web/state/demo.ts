// NEED CHANGE FILE NAME

import { MockStructData } from "layouts/menu-bar/mock";
import { atom } from "recoil";
import { Struct } from "../../packages/editor-ui/lib";

export const structState = atom<Struct[]>({
  key: "structState",
  default: MockStructData,
});

export const currentSelectedIdState = atom<string>({
  key: "currentSelectedIdState",
  default: "",
});
