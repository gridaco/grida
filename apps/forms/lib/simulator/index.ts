import { nanoid } from "nanoid";

export interface SimulationPlan {
  n: number; // Number of bots
  delaybetween: number; // Delay between submissions in ms
  queue: number; // Max number of concurrent submissions
  randomness: number; // Random coefficient for submission timing
}

type ResponseCallback = (id: string, response: SimulatorSubmission) => void;

export interface SimulatorSubmission<T = any> {
  _id: string;
  status?: 200 | 400 | 500 | (number | {});
  data?: T;
}

export class Simulator {
  readonly responses: SimulatorSubmission[] = [];
  private isPaused: boolean = false;
  private activeSubmissions: number = 0;
  private responseCallbacks: ResponseCallback[] = [];

  constructor(
    readonly form_id: string,
    readonly plan: SimulationPlan,
    readonly dryrun: boolean = false
  ) {}

  async start() {
    for (let i = 0; i < this.plan.n; i++) {
      if (this.isPaused) break;
      while (this.activeSubmissions >= this.plan.queue) {
        await this.sleep(100); // Wait for a slot in the queue
      }
      this.activeSubmissions++;
      this.submitForm().then(() => {
        this.activeSubmissions--;
      });
      const delay =
        this.plan.delaybetween *
        (1 + (Math.random() - 0.5) * this.plan.randomness);
      await this.sleep(delay);
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
      // Notify after response
      this.responseCallbacks.forEach((cb) => cb(_id, request));
    } catch (error) {
      console.error("Form submission failed", error);
    }
  }

  private generateFormData() {
    // Generate random form data
    return {
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
