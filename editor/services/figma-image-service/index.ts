import type { TargetImage, FigmaImageType, ImageHashMap } from "./types";
import { FigmaNodeImageStore, ImageHashmapCache } from "./figma-image-store";
import { Client } from "@design-sdk/figma-remote-api";
import { fetchNodeAsImage } from "@design-sdk/figma-remote";

/**
 * if the new request is made within 0.1 second (100ms), merge the requests.
 */
const DEBOUNCE = 100;

/**
 * Top level Figma image service to fetch images in a safe, promised and request efficient way.
 */
export class FigmaImageService {
  private store = new FigmaNodeImageStore(this.filekey);
  private api = Client({
    ...this.authentication,
  });
  private retries: number;

  /**
   * hashmaps of hash -> url
   */
  private imagehashmap: ImageHashMap = {};

  constructor(
    readonly filekey: string,
    private readonly authentication: {
      personalAccessToken?: string;
      accessToken?: string;
    },
    readonly version?: string | null
  ) {}

  warmup() {
    // load image has map from store if available
    this.imagehashmap = ImageHashmapCache.get(this.filekey);
    // fetch hasmap
    this.updateImageHashMap();
  }

  /**
   * current ongoing requests
   */
  private tasks = new Map<string, Promise<any>>();
  private timeout: number;
  private debounced: Promise<{ [key: string]: string }>;
  resolve: (
    value: { [key: string]: string } | PromiseLike<{ [key: string]: string }>
  ) => void;

  private pushTask<T = any>(id: string, task: Promise<T>) {
    this.tasks.set(id, task);
    task.finally(() => {
      this.tasks.delete(id);
    });
    return task;
  }

  private hasTask(id: string) {
    return this.tasks.has(id);
  }

  /**
   * next batch to run
   */
  private next_targets_queue = new Set<string>();

  private async updateImageHashMap() {
    if (this.hasTask("update-image-hash-map")) {
      return this.tasks.get("update-image-hash-map");
    } else {
      const { data } = await this.pushTask(
        "update-image-hash-map",
        this.api.fileImageFills(this.filekey)
      );

      this.imagehashmap = data.meta.images;

      ImageHashmapCache.set(this.filekey, this.imagehashmap);
    }
  }

  async fetch(
    target: TargetImage,
    {
      debounce: do_debounce = false,
      ensure = false,
    }: {
      /**
       * if true, it will not instantly fetch the image, but wait for a short period of time to batch requests.
       */
      debounce?: boolean;
      /**
       * if true, it will ensure the image is fetched and return the image url.
       * retry request on 429 error.
       */
      ensure?: boolean;
    }
  ): Promise<{ [key: string]: string }> {
    try {
      const results: { [key: string]: string } = {};
      const targets: Array<string> = [
        ...new Set(Array.isArray(target) ? target : [target]),
      ].filter((n) => !!n);

      // filtering targets.
      // 1. ignore targets with ongoing request.
      let tasktargets = targets.filter((t) => !this.hasTask(t));
      // 2. ignore targets in db.
      for (let i = 0; i < tasktargets.length; i++) {
        const t = tasktargets[i];
        // TODO: optimize with bulk get
        const image = await this.store.get({ id: t });
        if (image) {
          // remove from task targets
          tasktargets = tasktargets.filter((tt) => tt !== t);

          // add to results
          results[t] = image.url;
        }
      }

      const tasktargetsmap: {
        bakes: string[];
        images: string[];
      } = tasktargets.reduce(
        (acc, id) => {
          if (is_node_id(id)) {
            acc["bakes"].push(id);
          } else {
            acc["images"].push(id);
          }
          return acc;
        },
        {
          bakes: [],
          images: [],
        }
      );

      //
      const { bakes, images } = tasktargetsmap;
      const tasks: { [key: string]: Promise<string> } = {};

      //
      // fetch images (does not require debounce)
      if (images.length > 0) {
        const available = images.every((id) => !!this.imagehashmap[id]);
        if (available) {
          // add available images to results
          images.map((im) => {
            results[im] = this.imagehashmap[im];
          });
        } else {
          // not available in the current hashmap. the requested image is recently added to file.
          await this.updateImageHashMap();

          // add available images to results
          images.map((im) => {
            // this means invalid targets will mapped to undefined.
            results[im] = this.imagehashmap[im];
          });
        }
      }
      // fetch bakes (handle debounce)
      if (bakes.length > 0) {
        if (do_debounce) {
          // fetch with merged queues
          this.next_targets_queue = new Set([
            ...this.next_targets_queue,
            ...bakes,
          ]);

          if (this.timeout) {
            clearTimeout(this.timeout);
          }

          if (!this.debounced) {
            this.debounced = new Promise((resolve) => {
              this.resolve = resolve;
            });
          }

          // TODO: implement queue

          const handler = async () => {
            const targets = Array.from(this.next_targets_queue);
            this.next_targets_queue = new Set();
            const data = await this.fetch(targets, {
              ensure: true,
              debounce: false,
            });
            return { ...data, ...results };
          };

          this.timeout = setTimeout(async () => {
            const data = await handler();
            console.log("resolved");
            this.resolve(data);
            this.debounced = null;
          }, DEBOUNCE);

          return this.debounced;
        } else {
          // this does not support format, scale, ... (todo)
          const request = fetchNodeAsImage(
            this.filekey,
            this.authentication,
            ...bakes
          );

          for (const t of bakes) {
            tasks[t] = this.pushTask(
              t,
              new Promise((resolve) => {
                request.then((res) => {
                  resolve(res[t]);
                });
              })
            );
          }
        }
      }

      // final : resolve all, map, store to db.

      // const
      const keys = Object.keys(tasks);

      (await Promise.all(Object.values(tasks))).map((v, i, a) => {
        const k = keys[i];
        results[k] = v;
        this.store.upsert({
          id: k,
          url: v,
        });
      });

      //
      // before return
      // reset retries
      this.retries = 0;

      return results;
    } catch (e) {
      if (ensure) {
        this.retries += 1;

        // retry after (5 * retries) second
        const retry_after = 5000 * this.retries;
        await new Promise((r) =>
          setTimeout(() => {
            r(
              this.fetch(target, {
                debounce: false,
                ensure: true,
              })
            );
          }, retry_after)
        );
      }
    }
  }
}

function is_node_id(id: string) {
  return id.includes(":");
}
