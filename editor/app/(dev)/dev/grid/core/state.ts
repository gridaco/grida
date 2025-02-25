export interface State {
  is_insert_panel_open: boolean;
  blocks: Record<string, any>;
}

export const initial: State = {
  is_insert_panel_open: false,
  blocks: {},
};
