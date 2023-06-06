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
    readonly version?: string | null,
    readonly maxQueue = 100
  ) {}

  warmup() {
    // load image has map from store if available
    this.imagehashmap = ImageHashmapCache.get(this.filekey);
    // fetch hasmap
    this.updateImageHashMap();
  }

  /**
   * current ongoing requests (instant fetch)
   */
  private tasks = new Map<string, Promise<any>>();

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

  // #region queue debounced batch fetch
  private timeout: number;
  private queuedTasks = new Map<string, Promise<string>>();
  private queuedResolvers: Map<
    string,
    (value: string | PromiseLike<string>) => void
  > = new Map();
  /**
   * next batch to run
   */
  private queue = new Set<string>();
  private async pushQueuedTask(id: string, task: Promise<string>) {
    this.queuedTasks.set(id, task);
    task.finally(() => {
      this.queuedTasks.delete(id);
    });
    return task;
  }
  // #endregion

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
        exports: string[];
        images: string[];
      } = tasktargets.reduce(
        (acc, id) => {
          if (is_node_id(id)) {
            acc["exports"].push(id);
          } else {
            acc["images"].push(id);
          }
          return acc;
        },
        {
          exports: [],
          images: [],
        }
      );

      //
      const { exports, images } = tasktargetsmap;
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
      // fetch exports (handle debounce)
      if (exports.length > 0) {
        if (do_debounce) {
          // fetch with merged queues
          this.queue = new Set([...this.queue, ...exports]);

          const handle_queue = async () => {
            const fetchtargets = async (...targets) => {
              const data = await this.fetch(targets, {
                ensure: true,
                debounce: false,
              });
              return { ...data, ...results };
            };

            // copy queue
            const targets = [...this.queue];

            // reset queue
            this.queue.clear();

            const data = await fetchtargets(...targets);

            for (const key of targets) {
              const resolve = this.queuedResolvers.get(key);
              if (resolve) {
                resolve(data[key]);
                this.queuedResolvers.delete(key);
              } else {
                // throw new Error("no resolver found for " + key);
              }
            }
          };

          if (this.timeout) {
            clearTimeout(this.timeout);
          }

          // if the queue riched the max queue, run the queue immediately.
          if (this.queue.size >= this.maxQueue) {
            clearTimeout(this.timeout);
            handle_queue();
          } else {
            this.timeout = setTimeout(handle_queue, DEBOUNCE);
          }

          const promises = exports.map((b) => {
            const key = b;
            const promise = new Promise<string>((resolve) => {
              this.queuedResolvers.set(key, resolve);
            });
            tasks[b] = promise;

            return this.pushQueuedTask(b, promise);
          });

          return new Promise(async (resolve) => {
            const datas: { [key: string]: string } = await (
              await Promise.all(promises)
            ).reduce((acc, data: string, i) => {
              return {
                ...acc,
                [exports[i]]: data,
              };
            }, {});

            resolve({ ...datas, ...results });
          });
        } else {
          // this does not support format, scale, ... (todo)
          const request = fetchNodeAsImage(
            this.filekey,
            this.authentication,
            ...exports
          );

          for (const t of exports) {
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
      } else {
        return {};
      }
    }
  }
}

function is_node_id(id: string) {
  return id.includes(":");
}
