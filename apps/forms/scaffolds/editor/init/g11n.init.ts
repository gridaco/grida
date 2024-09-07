import type { FormBlock, FormFieldDefinition, LanguageCode } from "@/types";
import { g11nkey } from "../g11n";
import { FieldSupports } from "@/k/supported_field_types";

type ResourceKV = Record<string, string | null | undefined>;

abstract class G11nKVInit {
  readonly keys: string[] = [];
  readonly resources: ResourceKV = {};

  constructor() {}
}

export class FormDocumentG11nKVInit extends G11nKVInit {
  readonly keys: string[] = [];
  readonly resources: ResourceKV = {};

  constructor(
    readonly blocks: FormBlock[],
    readonly fields: FormFieldDefinition[]
  ) {
    super();
    const { keys, resources } = this.initialize();

    this.keys = keys;
    this.resources = resources;
  }

  private initialize(): {
    keys: string[];
    resources: ResourceKV;
  } {
    const keys: string[] = [];
    const resources: ResourceKV = {};

    this.blocks.forEach((b) => {
      if (b.type === "field") {
        if (!b.form_field_id) {
          return;
        }

        const field = this.fields.find((f) => f.id === b.form_field_id);
        if (!field) {
          return;
        }

        const labelkey = g11nkey("field", { id: b.id, property: "label" });
        const placeholderkey = g11nkey("field", {
          id: b.id,
          property: "placeholder",
        });
        const helptextkey = g11nkey("field", {
          id: b.id,
          property: "help_text",
        });

        if (FieldSupports.placeholder(field.type)) {
          keys.push(labelkey, placeholderkey, helptextkey);
          resources[labelkey] = field.label;
          resources[placeholderkey] = field.placeholder;
          resources[helptextkey] = field.help_text;
        } else {
          // conditionally available
          keys.push(labelkey, /*placeholderkey*/ helptextkey);

          resources[labelkey] = field.label;
          resources[helptextkey] = field.help_text;
        }
      } else {
        switch (b.type) {
          case "video":
          case "image":
          case "pdf": {
            const srckey = g11nkey("block", { id: b.id, property: "src" });

            // register key
            keys.push(srckey);

            // register resource
            resources[srckey] = b.data.src;
            break;
          }
          case "header": {
            const titlekey = g11nkey("block", {
              id: b.id,
              property: "title_html",
            });

            const descriptionkey = g11nkey("block", {
              id: b.id,
              property: "description_html",
            });

            // register key
            keys.push(titlekey);
            keys.push(descriptionkey);

            // register resource
            resources[titlekey] = b.title_html;
            resources[descriptionkey] = b.description_html;
            break;
          }
          case "html": {
            const bodykey = g11nkey("block", {
              id: b.id,
              property: "body_html",
            });

            // register key
            keys.push(bodykey);

            // register resource
            resources[bodykey] = b.body_html;
            break;
          }

          case "section":
          case "group":
          case "divider":
            break;
        }
      }
    });

    return {
      keys,
      resources,
    };
  }
}
