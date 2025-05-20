import { FieldSupports } from "@/k/supported_field_types";
import { FormRenderTree } from "../../grida-forms/lib";
import { faker } from "@faker-js/faker";
import { SYSTEM_GF_CUSTOMER_UUID_KEY } from "@/k/system";
import { Platform } from "@/lib/platform";

export type FakeLocationPlan =
  | { type: "world" }
  | { type: "point"; latitude: number; longitude: number };

export class CustomerFaker {
  constructor(
    readonly identities: ReadonlyArray<string>,
    readonly location: FakeLocationPlan
  ) {}

  private get identity() {
    return this.identities[Math.floor(Math.random() * this.identities.length)];
  }

  clientdata() {
    const lat =
      this.location.type === "point"
        ? this.location.latitude
        : faker.location.latitude();

    const lon =
      this.location.type === "point"
        ? this.location.longitude
        : faker.location.longitude();

    return {
      data: {
        [SYSTEM_GF_CUSTOMER_UUID_KEY]: this.identity,
      },
      headers: {
        [Platform.headers["x-gf-geo-city"]]: faker.location.city(),
        [Platform.headers["x-gf-geo-latitude"]]: lat.toString(),
        [Platform.headers["x-gf-geo-longitude"]]: lon.toString(),
        [Platform.headers["x-gf-geo-region"]]: faker.location.state(),
        [Platform.headers["x-gf-geo-country"]]: faker.location.country(),
        [Platform.headers["x-gf-simulator"]]: "1",
      },
    };
    //
  }
}

export class FormDataFaker {
  constructor(readonly schema: FormRenderTree) {}

  private randoption(field: string) {
    // random option
    const options = this.schema.options({ of: field });
    const randop = this.rand(options);
    return randop.id;
  }

  private rand<T>(arr: T[]) {
    // random from array
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private randtext() {
    // random text
    return "__SIMULATED__ " + faker.lorem.sentence();
  }

  private randnumber() {
    // random number
    return faker.number.int(100);
  }

  formdata() {
    //
    const data: any = {};

    for (const field of this.schema.fields({ render: true })) {
      const { id, name, options, type } = field;

      if (FieldSupports.options(type)) {
        data[name] = this.randoption(id);
      } else {
        switch (field.type) {
          case "number":
            data[name] = this.randnumber();
            break;
          case "text":
            data[name] = this.randtext();
            break;
          default:
            data[name] = this.randtext();
            break;
        }
      }
    }

    return data;
  }
}
