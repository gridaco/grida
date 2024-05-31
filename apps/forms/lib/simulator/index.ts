export interface SimulationPlan {
  n: number; // Number of bots
  delaybetween: number; // Delay between submissions in ms
  queue: number; // Max number of concurrent submissions
  randomness: number; // Random coefficient for submission timing
}

type ResponseCallback = (response: any) => void;

export class Simulator {
  readonly responses: any[] = [];
  private isPaused: boolean = false;
  private activeSubmissions: number = 0;
  private responseCallbacks: ResponseCallback[] = [];

  constructor(
    readonly form_id: string,
    readonly plan: SimulationPlan
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
      const response = await submit(this.form_id, data);
      this.responses.push(response);
      this.responseCallbacks.forEach((cb) => cb(response)); // Notify listeners of the new response
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
