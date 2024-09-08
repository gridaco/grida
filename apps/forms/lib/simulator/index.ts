import { SYSTEM_X_GF_SIMULATOR_FLAG_KEY } from "@/k/system";
import { nanoid } from "nanoid";
import { v4 } from "uuid";
import { FormRenderTree } from "../forms";
import { createClientComponentFormsClient } from "../../supabase/client";
import assert from "assert";
import { FormDocument } from "@/types";
import { FormSubmitErrorCode } from "@/types/private/api";
import { type FakeLocationPlan, FormDataFaker, CustomerFaker } from "./faker";

export interface SimulationPlan {
  n: number; // Total number of submissions
  bots: number; // Number of bots (customer identities to simulate)
  delaybetween: number; // Delay between submissions in ms
  maxq: number; // Base number of concurrent submissions per batch
  randomness: number; // Random coefficient for submission timing
  location: FakeLocationPlan;
}

type ResponseCallback = (id: string, response: SimulatorSubmission) => void;
type EndCallback = () => void;

export interface SimulatorSubmission<T = any> {
  __id: string;
  bot_id: string;
  requestedAt: Date;
  resolvedAt?: Date;
  status?: 200 | 400 | 500 | (number | {});
  data?: T;
  response?: {
    id: string;
  };
  headers?: { [key: string]: string };
  error?: {
    message: string;
    code: FormSubmitErrorCode;
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

  private __schema: FormRenderTree | null = null;

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

  private async _fetch_form_schema() {
    const { data } = await createClientComponentFormsClient()
      .from("form")
      .select(
        `
          *,
          fields:form_field(
            *,
            options:form_field_option(*)
          ),
          default_page:form_document!default_form_page_id(
            *,
            blocks:form_block(*)
          )
        `
      )
      .eq("id", this.form_id)
      .single();

    assert(!!data, "form not found");

    const { blocks: page_blocks, lang: page_language } =
      data.default_page as unknown as FormDocument;

    this.__schema = new FormRenderTree(
      data.id,
      data.title,
      data.description,
      page_language,
      data.fields,
      page_blocks
    );
  }

  async start() {
    await this._fetch_form_schema();
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

  addOnRequestChangeListener(callback: ResponseCallback) {
    this.responseCallbacks.push(callback);
  }

  removeOnRequestChangeListener(callback: ResponseCallback) {
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
        __id: _id,
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

      try {
        const response = await submit(this.form_id, formdata, headers);
        const responsejson = await response
          .json()
          .catch(() => ({ error: null, message: "Invalid JSON response" }));

        request.status = response.status;
        request.response = responsejson.data;
        request.resolvedAt = new Date();

        if (!response.ok) {
          request.error = {
            code: responsejson.error,
            message: responsejson.message,
          };
        }
      } catch (e) {
        console.error("Form submission failed", e);
        // possibly when json parsing fails
        request.error = {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        };
      }

      // Notify after response
      this.responseCallbacks.forEach((cb) => cb(_id, request));
    } catch (error) {
      console.error("Form submission failed", error);
    }
  }

  private fakedata() {
    // Generate random form data

    const datafaker = new FormDataFaker(this.__schema!);
    const customerfaker = new CustomerFaker(this.bot_ids, this.plan.location);

    const formdata = datafaker.formdata();
    const customerdata = customerfaker.clientdata();

    return {
      formdata: {
        ...customerdata.data,
        ...formdata,
      },
      headers: {
        ...customerdata.headers,
        [SYSTEM_X_GF_SIMULATOR_FLAG_KEY]: "1",
        accept: "application/json",
      },
      bot_id: customerdata.data.__gf_customer_uuid,

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
