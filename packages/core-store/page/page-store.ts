import { Page, PageDocumentType } from "@core/model";
import { BoringDocumentsStore } from "@boring.so/store";
import { BaseSimpleModelIdbStore } from "../_store/base-store";
import { BoringDocument } from "@boring.so/document-model";

/*no-export*/ interface PageStoreModel {
  id: string;
  type: PageDocumentType;
  name: string;
  /**
   * linked page document id
   */
  document: string;

  /** parent page id of this page */
  parent: string;
  /** sorting under parent */
  sort: number;
}

/**
 * pages table name
 **/
const STORE_PAGES = "pages";
const DB_PAGE_N = "page-store";

/**
 * keep this 1 until production release.
 * use the "delete database"  from developer tools instead of incrementing dbver.
 **/
const DB_PAGE_V = 1;

/**
 *
 **/
export class PageStore extends BaseSimpleModelIdbStore<Page, PageStoreModel> {
  readonly service_boringdocument: BoringDocumentsStore;

  readonly tmpstore = new Map<string, Page | PageStoreModel>();

  constructor() {
    super({
      dbname: DB_PAGE_N,
      dbver: DB_PAGE_V,
      store: STORE_PAGES,
    });

    this.service_boringdocument = new BoringDocumentsStore();
  }

  async get(id: string): Promise<Page> {
    const stored = this.tmpstore.has(id)
      ? this.tmpstore.get(id)
      : await (await this.db()).get(STORE_PAGES, id);
    if (stored) {
      return await this.map_o(stored);
    }
  }

  async add(page: Page | PageStoreModel) {
    this.tmpstore.set(page.id, page);
    const storable = await this.map_i(page);
    await (await this.db()).add(STORE_PAGES, storable);
    this.tmpstore.delete(page.id);
  }

  async getAll(): Promise<PageStoreModel[]> {
    const stores: PageStoreModel[] = await (
      await this.db()
    ).getAll(STORE_PAGES);
    return stores;
  }

  // explicit member methods
  private async map_i(p: Page | PageStoreModel): Promise<PageStoreModel> {
    if (!p.document) {
      throw "document cannot be empty for page store input";
    }

    // 1. save document if needed.
    const docid = async () => {
      let documentid;
      if (p.document instanceof BoringDocument) {
        await this.service_boringdocument.put(p.document);
        documentid = p.document.id;
      } else {
        documentid = p.document;
      }
      return documentid;
    };

    // 2. save with previously set document's reference via id.
    const storable = <PageStoreModel>{
      ...p,
      document: await docid(),
    };
    return storable;
  }

  private async map_o(p: PageStoreModel): Promise<Page> {
    const doc = async (id: string): Promise<BoringDocument> => {
      const _d = await this.service_boringdocument.get(id);
      return _d;
    };

    return {
      ...p,
      document: await doc(p.document),
    };
  }
}
