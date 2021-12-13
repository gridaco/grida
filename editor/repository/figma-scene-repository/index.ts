import {
  addPouchPlugin,
  createRxDatabase,
  getRxStoragePouch,
  RxDatabase,
  RxJsonSchema,
  RxSchema,
} from "rxdb";
import PouchDbAdapterIdb from "pouchdb-adapter-idb";
import { SceneNode } from "@design-sdk/figma-types";

addPouchPlugin(PouchDbAdapterIdb);

export class FigmaSceneRepository {
  private db: RxDatabase;
  constructor() {}
}

async function initdb() {
  const db = await createRxDatabase({
    name: "heroesdb", // <- name
    storage: getRxStoragePouch("idb"), // <- storage-adapter
    multiInstance: false,
    eventReduce: false, // <- eventReduce (optional, default: true)
  });

  db.addCollections({
    scenes: {
      schema: FigmaSceneNodeSchema,
    },
  });

  return db;
}

const FigmaSceneNodeSchema: RxJsonSchema<SceneNode> = {
  keyCompression: true, // set this to true, to enable the keyCompression
  version: 0,
  title: "figma scene nodes",
  primaryKey: {
    key: "id",
    fields: ["name"],
    separator: "|",
  },
  type: "object",
  properties: {
    id: {
      type: "string",
    },
    name: {
      type: "string",
    },
    parentId: {
      type: "string",
    },
    visible: {
      type: "boolean",
    },
    locked: {
      type: "boolean",
    },
    children: {
      type: "array",
    },
    width: {
      type: "number",
    },
    x: {
      type: "number",
    },
    y: {
      type: "number",
    },
  },
  required: ["id", "name"],
};
