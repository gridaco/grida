import type { SchemaAction } from "../action";
import type { grida } from "@/grida";
import produce from "immer";

export default function schemaReducer(
  state: grida.program.schema.Properties = {},
  action: SchemaAction
): grida.program.schema.Properties {
  switch (action.type) {
    case "document/properties/define": {
      return produce(state, (draft) => {
        const property_name =
          action.key ?? "new_property_" + (Object.keys(state).length + 1);
        draft[property_name] = action.definition ?? {
          type: "string",
        };
      });
    }
    case "document/properties/rename": {
      const { key: name, newKey: newName } = action;
      return produce(state, (draft) => {
        // check for conflict
        if (draft[newName]) {
          return;
        }

        draft[newName] = draft[name];
        delete draft[name];
      });
    }
    case "document/properties/update": {
      return produce(state, (draft) => {
        if (!draft[action.key]) return;
        draft[action.key] = action.definition;
      });
    }
    case "document/properties/put": {
      return produce(state, (draft) => {
        draft[action.key] = action.definition;
      });
    }
    case "document/properties/delete": {
      return produce(state, (draft) => {
        delete draft[action.key];
      });
    }
  }
}
