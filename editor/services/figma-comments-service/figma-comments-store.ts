import { openDB, IDBPDatabase } from "idb";
import type { Comment } from "@design-sdk/figma-remote-types";

type IndexedComment = Comment & {
  [__index]: string;
};

// #region global db initialization
const __db_pref = { name: "fimga-comments-store", version: 3 };
const __pk = "id";
const __table = "comments";
const __index = "filekey";

const connect = (): Promise<IDBPDatabase<IndexedComment>> =>
  new Promise((resolve) => {
    // disable on ssr
    if (typeof window === "undefined") {
      return;
    }

    openDB<IndexedComment>(__db_pref.name, __db_pref.version, {
      upgrade(db) {
        const store = db.createObjectStore(__table, {
          keyPath: __pk,
        });
        store.createIndex(__index, __index, { unique: false });
      },
    }).then((_db) => {
      resolve(_db);
    });
  });
// #endregion

export class FigmaCommentsStore {
  constructor(readonly filekey: string) {}
  static of = (filekey: string): FigmaCommentsStore => {
    return new FigmaCommentsStore(filekey);
  };

  private _db: IDBPDatabase<IndexedComment>;
  private get db(): Promise<IDBPDatabase<IndexedComment>> {
    if (this._db) {
      return Promise.resolve(this._db);
    } else {
      return connect().then((db) => {
        this._db = db;
        return db;
      });
    }
  }

  async clear() {
    // clear with index
    const pdestroy = await (
      await this.db
    ).getAllKeysFromIndex(__table, __index, this.filekey);
    await (await this.db).delete(__table, pdestroy);
  }

  async upsert(image: Comment) {
    await (
      await this.db
    ).put(__table, <IndexedComment>{
      ...image,
      [__pk]: image.id,
      filekey: this.filekey,
    });
  }

  async getAll(): Promise<ReadonlyArray<IndexedComment>> {
    const recs = await (
      await this.db
    ).getAllFromIndex(__table, __index, this.filekey);
    return recs;
  }

  async get(query: { id: string }): Promise<IndexedComment> {
    const rec = await (await this.db).get(__table, query.id);
    return rec;
  }

  async delete(query: { id: string }) {
    await (await this.db).delete(__table, query.id);
  }
}
