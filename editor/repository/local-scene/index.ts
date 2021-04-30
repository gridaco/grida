import { openDB, deleteDB, wrap, unwrap } from "idb";

export class LocalFigmaSceneRepository {
  open() {
    openDB("").then((db) => {
      // db.getKey("")
    });
  }
}
