import { openDB, IDBPDatabase } from "idb";
import type { Comment } from "@design-sdk/figma-remote-types";

type IndexedComment = Comment;

// #region global db initialization
const __db_pref = { name: "fimga-comments-store", version: 1 };
const __pk = "id";

export const db = (filekey: string): Promise<IDBPDatabase<IndexedComment>> =>
  new Promise((resolve) => {
    // disable on ssr
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    openDB<IndexedComment>(__db_pref.name, __db_pref.version, {
      upgrade(db) {
        db.createObjectStore(filekey, {
          keyPath: __pk,
        });
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

  private get db(): Promise<IDBPDatabase<IndexedComment>> {
    return db(this.filekey);
  }

  async clear() {
    await (await this.db).clear(this.filekey);
  }

  async upsert(image: IndexedComment) {
    try {
      await (
        await this.db
      ).put(this.filekey, <IndexedComment>{
        ...image,
        [__pk]: image.id,
      });
    } catch (e) {}
  }

  async getAll(): Promise<ReadonlyArray<IndexedComment>> {
    const recs = await (await this.db).getAll(this.filekey);
    return recs;
  }

  async get(query: { id: string }): Promise<IndexedComment> {
    const rec = await (await this.db).get(this.filekey, query.id);
    return rec;
  }

  async delete(query: { id: string }) {
    await (await this.db).delete(this.filekey, query.id);
  }
}
