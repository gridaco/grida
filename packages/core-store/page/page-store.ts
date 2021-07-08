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

  constructor() {
    super({
      dbname: DB_PAGE_N,
      dbver: DB_PAGE_V,
      store: STORE_PAGES,
    });

    this.service_boringdocument = new BoringDocumentsStore();
  }

  async get(id: string): Promise<Page> {
    const stored = await (await this.db()).get(STORE_PAGES, id);
    return await this.map_o(stored);
  }

  async add(page: Page | PageStoreModel) {
    const storable = this.map_i(page);
    await (await this.db()).add(STORE_PAGES, storable);
  }

  async getAll(): Promise<PageStoreModel[]> {
    const stores: PageStoreModel[] = await (
      await this.db()
    ).getAll(STORE_PAGES);
    return stores;
  }

  // explicit member methods
  private async map_i(p: Page | PageStoreModel): Promise<PageStoreModel> {
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
      id: p.id,
      type: p.type,
      name: p.name,
      document: await docid(),
    };
    return storable;
  }

  private async map_o(p: PageStoreModel): Promise<Page> {
    const doc = async (id: string): Promise<BoringDocument> => {
      const _d = await this.service_boringdocument.get(p.document);
      return _d;
    };

    return {
      id: p.id,
      name: p.name,
      document: await doc(p.document),
      type: p.type,
    };
  }
}
