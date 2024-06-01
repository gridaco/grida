import {
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_GEO_CITY_KEY,
  SYSTEM_GF_GEO_COUNTRY_KEY,
  SYSTEM_GF_GEO_LATITUDE_KEY,
  SYSTEM_GF_GEO_LONGITUDE_KEY,
  SYSTEM_GF_GEO_REGION_KEY,
  SYSTEM_GF_SIMULATOR_FLAG_KEY,
} from "@/k/system";
import { faker } from "@faker-js/faker";
import { nanoid } from "nanoid";

export interface SimulationPlan {
  n: number; // Total number of submissions
  delaybetween: number; // Delay between submissions in ms
  queue: number; // Base number of concurrent submissions per batch
  randomness: number; // Random coefficient for submission timing
}

type ResponseCallback = (id: string, response: SimulatorSubmission) => void;
type EndCallback = () => void;

export interface SimulatorSubmission<T = any> {
  _id: string;
  resolvedAt?: Date;
  status?: 200 | 400 | 500 | (number | {});
  data?: T;
}

export class Simulator {
  readonly responses: SimulatorSubmission[] = [];
  private isPaused: boolean = false;
  private isEnded: boolean = false;
  private activeSubmissions: number = 0;
  private responseCallbacks: ResponseCallback[] = [];
  private endCallback?: EndCallback;
  private totalSubmitted: number = 0;

  constructor(
    readonly form_id: string,
    readonly plan: SimulationPlan,
    readonly dryrun: boolean = false
  ) {}

  async start() {
    while (this.totalSubmitted < this.plan.n && !this.isPaused) {
      const randomizedQueue = Math.floor(
        this.plan.queue * (1 + (Math.random() - 0.5) * this.plan.randomness)
      );
      const batchCount = Math.min(
        randomizedQueue,
        this.plan.n - this.totalSubmitted
      );
      await this.submitBatch(batchCount);
    }

    // end
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
      promises.push(this.submitForm());
      const delay =
        this.plan.delaybetween *
        (1 + (Math.random() - 0.5) * this.plan.randomness);
      await this.sleep(delay);
    }
    await Promise.all(promises);
    this.totalSubmitted += batchCount;
  }

  private async submitForm() {
    const data = this.generateFormData();
    try {
      const _id = nanoid();
      const request: SimulatorSubmission = {
        _id,
        status: undefined,
        data: data,
      };
      this.responses.push(request);
      // Notify initially
      this.responseCallbacks.forEach((cb) => cb(_id, request));
      if (this.dryrun) {
        return;
      }
      const response = await submit(this.form_id, data);
      request.status = response.status;
      request.resolvedAt = new Date();
      // Notify after response
      this.responseCallbacks.forEach((cb) => cb(_id, request));
    } catch (error) {
      console.error("Form submission failed", error);
    }
  }

  private generateFormData() {
    // Generate random form data
    return {
      [SYSTEM_GF_CUSTOMER_UUID_KEY]: faker.string.uuid(),
      [SYSTEM_GF_GEO_CITY_KEY]: faker.location.city(),
      [SYSTEM_GF_GEO_LATITUDE_KEY]: faker.location.latitude(),
      [SYSTEM_GF_GEO_LONGITUDE_KEY]: faker.location.longitude(),
      [SYSTEM_GF_GEO_REGION_KEY]: faker.location.state(),
      [SYSTEM_GF_GEO_COUNTRY_KEY]: faker.location.country(),
      [SYSTEM_GF_SIMULATOR_FLAG_KEY]: true,

      // TODO: use faker to generate random data based on form schema
      // Add your form data structure here
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function submit(form_id: string, data: any) {
  const formdata = new FormData();
  for (const key in data) {
    formdata.append(key, data[key]);
  }

  return fetch(`/submit/${form_id}`, {
    method: "POST",
    body: formdata,
  });
}
