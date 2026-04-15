import type { GridaBlock } from "../blocks";

export interface State {
  is_insert_panel_open: boolean;
  blocks: Record<string, GridaBlock>;
}

export const initial: State = {
  is_insert_panel_open: false,
  blocks: {},
};
