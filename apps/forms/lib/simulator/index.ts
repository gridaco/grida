import {
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_X_GF_GEO_CITY_KEY,
  SYSTEM_X_GF_GEO_COUNTRY_KEY,
  SYSTEM_X_GF_GEO_LATITUDE_KEY,
  SYSTEM_X_GF_GEO_LONGITUDE_KEY,
  SYSTEM_X_GF_GEO_REGION_KEY,
  SYSTEM_X_GF_SIMULATOR_FLAG_KEY,
} from "@/k/system";
import { faker } from "@faker-js/faker";
import { nanoid } from "nanoid";
import { v4 } from "uuid";

export interface SimulationPlan {
  n: number; // Total number of submissions
  bots: number; // Number of bots (customer identities to simulate)
  delaybetween: number; // Delay between submissions in ms
  maxq: number; // Base number of concurrent submissions per batch
  randomness: number; // Random coefficient for submission timing
}

type ResponseCallback = (id: string, response: SimulatorSubmission) => void;
type EndCallback = () => void;

export interface SimulatorSubmission<T = any> {
  _id: string;
  bot_id: string;
  requestedAt: Date;
  resolvedAt?: Date;
  status?: 200 | 400 | 500 | (number | {});
  data?: T;
  headers?: { [key: string]: string };
  error?: {
    message: string;
    code: number;
  };
}

export class Simulator {
  readonly responses: SimulatorSubmission[] = [];
  private isPaused: boolean = false;
  private isEnded: boolean = false;
  private activeSubmissions: number = 0;
  private responseCallbacks: ResponseCallback[] = [];
  private endCallback?: EndCallback;
  private totalSubmitted: number = 0;
  private readonly bot_ids: ReadonlyArray<string> = [];

  constructor(
    readonly form_id: string,
    readonly plan: SimulationPlan,
    readonly dryrun: boolean = false
  ) {
    const bot_ids = [];
    for (let i = 0; i < plan.bots; i++) {
      bot_ids.push(v4());
    }
    this.bot_ids = bot_ids;
  }

  async start() {
    while (this.totalSubmitted < this.plan.n && !this.isPaused) {
      const randomizedQueue = Math.floor(
        this.plan.maxq * (1 + (Math.random() - 0.5) * this.plan.randomness)
      );
      const batchCount = Math.min(
        randomizedQueue,
        this.plan.n - this.totalSubmitted
      );
      await this.submitBatch(batchCount);
    }

    // End
    if (this.isEnded) return;
    if (this.totalSubmitted >= this.plan.n) {
      this.isEnded = true;
      this.endCallback?.();
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.start();
    }
  }

  onResponse(callback: ResponseCallback) {
    this.responseCallbacks.push(callback);
  }

  offResponse(callback: ResponseCallback) {
    this.responseCallbacks = this.responseCallbacks.filter(
      (cb) => cb !== callback
    );
  }

  onEnd(callback: EndCallback) {
    this.endCallback = callback;
  }

  private async submitBatch(batchCount: number) {
    const promises = [];
    for (let i = 0; i < batchCount; i++) {
      if (this.isPaused) break;

      const delay =
        this.plan.delaybetween *
        (1 + (Math.random() - 0.5) * this.plan.randomness);

      promises.push(
        new Promise((resolve) => {
          setTimeout(() => {
            this.activeSubmissions++;
            this.submitForm().finally(() => {
              this.activeSubmissions--;
              resolve("done");
            });
          }, delay);
        })
      );
    }
    await Promise.all(promises);
    this.totalSubmitted += batchCount;
  }

  private async submitForm() {
    const { formdata, headers, bot_id } = this.fakedata();
    try {
      const _id = nanoid();
      const request: SimulatorSubmission = {
        _id,
        bot_id,
        requestedAt: new Date(),
        status: undefined,
        data: formdata,
        headers,
      };
      this.responses.push(request);
      // Notify initially
      this.responseCallbacks.forEach((cb) => cb(_id, request));
      if (this.dryrun) {
        return;
      }
      const response = await submit(this.form_id, formdata, headers);
      request.status = response.status;
      request.resolvedAt = new Date();

      if ((request.status as number) >= 400) {
        const errdata = await response.json();
        request.error = {
          code: errdata.error,
          message: errdata.message,
        };
      }
      // Notify after response
      this.responseCallbacks.forEach((cb) => cb(_id, request));
    } catch (error) {
      console.error("Form submission failed", error);
    }
  }

  private get identity() {
    // randomize bot_id
    return this.bot_ids[Math.floor(Math.random() * this.bot_ids.length)];
  }

  private fakedata() {
    // Generate random form data
    const customer_uuid = this.identity;

    return {
      formdata: {
        [SYSTEM_GF_CUSTOMER_UUID_KEY]: customer_uuid,
      },
      headers: {
        [SYSTEM_X_GF_GEO_CITY_KEY]: faker.location.city(),
        [SYSTEM_X_GF_GEO_LATITUDE_KEY]: faker.location.latitude().toString(),
        [SYSTEM_X_GF_GEO_LONGITUDE_KEY]: faker.location.longitude().toString(),
        [SYSTEM_X_GF_GEO_REGION_KEY]: faker.location.state(),
        [SYSTEM_X_GF_GEO_COUNTRY_KEY]: faker.location.country(),
        [SYSTEM_X_GF_SIMULATOR_FLAG_KEY]: "1",
        accept: "application/json",
      },
      bot_id: customer_uuid,

      // TODO: use faker to generate random data based on form schema
      // Add your form data structure here
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function submit(form_id: string, data: any, headers: any = {}) {
  const formdata = new FormData();
  for (const key in data) {
    formdata.append(key, data[key]);
  }

  return fetch(`/submit/${form_id}`, {
    method: "POST",
    body: formdata,
    headers,
  });
}
