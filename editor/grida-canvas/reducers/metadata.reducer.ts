import type grida from "@grida/schema";
import type { MetadataAction } from "../action";

export default function metadataReducer(
  state: grida.program.document.INodeMetadata["metadata"] = {},
  action: MetadataAction
): grida.program.document.INodeMetadata["metadata"] {
  switch (action.type) {
    case "node-metadata/set":
      return {
        ...state,
        [action.node_id]: {
          ...state[action.node_id],
          [action.namespace]: action.data,
        },
      };
    case "node-metadata/remove":
      const { [action.namespace]: removed, ...rest } =
        state[action.node_id] || {};
      const newState = { ...state };
      if (Object.keys(rest).length > 0) {
        newState[action.node_id] = rest;
      } else {
        delete newState[action.node_id];
      }
      return newState;
    case "node-metadata/remove-all":
      const { [action.node_id]: _, ...remaining } = state;
      return remaining;
    default:
      return state;
  }
}
