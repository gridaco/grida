import type { SchemaAction } from "../action";
import type grida from "@grida/schema";
import { updateState } from "./utils/immer";

export class SchemaManager {
  private properties: grida.program.schema.Properties;

  constructor(initialProperties: grida.program.schema.Properties = {}) {
    this.properties = { ...initialProperties };
  }

  /**
   * Defines a new property in the schema
   * @param key Optional property name, will auto-generate if not provided
   * @param definition Property definition, defaults to string type if not provided
   */
  defineProperty(
    key?: string,
    definition?: grida.program.schema.PropertyDefinition
  ) {
    const propertyName =
      key ?? "new_property_" + (Object.keys(this.properties).length + 1);
    this.properties[propertyName] = definition ?? { type: "string" };
    return this.properties;
  }

  /**
   * Renames an existing property
   * @param oldName Current property name
   * @param newName New property name
   * @returns false if rename failed due to conflict
   */
  renameProperty(oldName: string, newName: string): boolean {
    if (this.properties[newName]) {
      return false;
    }
    this.properties[newName] = this.properties[oldName];
    delete this.properties[oldName];
    return true;
  }

  /**
   * Updates an existing property's definition
   * @param key Property name
   * @param definition New property definition
   * @returns false if property doesn't exist
   */
  updateProperty(
    key: string,
    definition: grida.program.schema.PropertyDefinition
  ): boolean {
    if (!this.properties[key]) {
      return false;
    }
    this.properties[key] = definition;
    return true;
  }

  /**
   * Creates or updates a property
   * @param key Property name
   * @param definition Property definition
   */
  putProperty(
    key: string,
    definition: grida.program.schema.PropertyDefinition
  ) {
    this.properties[key] = definition;
    return this.properties;
  }

  /**
   * Deletes a property
   * @param key Property name to delete
   */
  deleteProperty(key: string) {
    delete this.properties[key];
    return this.properties;
  }

  /**
   * Gets the current properties
   */
  getProperties(): grida.program.schema.Properties {
    return this.properties;
  }

  snapshot(): grida.program.schema.Properties {
    return { ...this.properties };
  }
}

export default function schemaReducer(
  state: grida.program.schema.Properties = {},
  action: SchemaAction
): grida.program.schema.Properties {
  const manager = new SchemaManager(state);

  switch (action.type) {
    case "document/properties/define": {
      return updateState(state, (draft) => {
        manager.defineProperty(action.key, action.definition);
        forceAssign(draft, manager.snapshot());
      });
    }
    case "document/properties/rename": {
      return updateState(state, (draft) => {
        const { key: name, newKey: newName } = action;
        const success = manager.renameProperty(name, newName);
        if (success) {
          forceAssign(draft, manager.snapshot());
        }
      });
    }
    case "document/properties/update": {
      return updateState(state, (draft) => {
        const success = manager.updateProperty(action.key, action.definition);
        if (success) {
          forceAssign(draft, manager.snapshot());
        }
      });
    }
    case "document/properties/put": {
      return updateState(state, (draft) => {
        manager.putProperty(action.key, action.definition);
        forceAssign(draft, manager.snapshot());
      });
    }
    case "document/properties/delete": {
      return updateState(state, (draft) => {
        manager.deleteProperty(action.key);
        forceAssign(draft, manager.snapshot());
      });
    }
  }
}

/**
 * Forces a complete state update by clearing the draft and assigning new state
 * @param draft The immer draft to modify
 */
function forceAssign(
  draft: grida.program.schema.Properties,
  next: grida.program.schema.Properties
) {
  // Clear all existing properties
  Object.keys(draft).forEach((key) => {
    delete draft[key];
  });
  // Assign new state
  Object.assign(draft, next);
}
