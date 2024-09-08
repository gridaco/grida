import { FormRenderTree } from "@/lib/forms";
import { type JSONForm } from "@/types";
import type { Database } from "@/database.types";
import { toArrayOf } from "@/types/utility";
import { SupabaseClient } from "@supabase/supabase-js";
import assert from "assert";
import { workspaceclient } from "@/supabase/server";

type ID = string;
type FormFieldInsertion =
  Database["grida_forms"]["Tables"]["form_field"]["Insert"];
type FormFieldOptionInsertion =
  Database["grida_forms"]["Tables"]["form_field_option"]["Insert"];
type FormBlockInsertion =
  Database["grida_forms"]["Tables"]["form_block"]["Insert"];

/**
 * this is a service to initialize Grida forms form via JSON input
 *
 * as data ooeration, the json 2 form will be processed as follows:
 *
 * - 1. create a new form (grida_forms.form)
 * - 2. create a new form document (grida_forms.form_document)
 * - 3. create fields (grida_forms.form_field)
 * - 4. create options (grida_forms.form_field_option)
 * // TODO:
 * - 5. create blocks (grida_forms.form_block)
 */
export class JSONFrom2DB {
  private renderer: FormRenderTree;
  private form_id: ID | null = null;
  private form_document_id: ID | null = null;
  private fields_db_map: Record<string, ID> = {};
  private fields_db_map_ready = false;

  constructor(
    readonly client: SupabaseClient<Database, "grida_forms">,
    readonly project_id: number,
    readonly json: JSONForm
  ) {
    assert(this.project_id, "project_id is required");
    this.renderer = new FormRenderTree(
      "[draft]",
      json.title,
      json.description,
      json.lang,
      json.fields,
      [],
      // TODO: consider moving this outerside or upper class
      {
        blocks: {
          when_empty: {
            header: {
              title_and_description: {
                enabled: true,
              },
            },
          },
        },
      }
    );
    //
  }
  //

  private async insert_form() {
    const _ = await this.client
      .from("form")
      .insert({
        project_id: this.project_id,
        title: this.renderer.title || undefined,
        description: this.renderer.description,
      })
      .select()
      .single();

    assert(!!_.data, "form not inserted");
    this.form_id = _.data.id;

    return _;
  }

  private async insert_form_document() {
    assert(!!this.form_id, "form not inserted");
    if (this.form_document_id) {
      return;
    }

    // insert document
    // this is bad, but since form is created, its safe to use without rls.
    const { data: docref } = await workspaceclient
      .from("document")
      .insert({
        project_id: this.project_id,
        doctype: "v0_form",
        title: this.renderer.title ?? undefined,
      })
      .select()
      .single();

    const _ = await this.client
      .from("form_document")
      .insert({
        id: docref!.id,
        form_id: this.form_id,
        project_id: this.project_id,
        lang: this.renderer.lang || undefined,
      })
      .select()
      .single();
    const { data } = _;

    assert(!!data, "page not inserted");

    this.form_document_id = data.id;

    await this.client
      .from("form")
      .update({
        default_form_page_id: data.id,
      })
      .eq("id", this.form_id);

    return _;
  }

  private async insert_fields() {
    assert(!!this.form_id, "form not inserted");

    const rows: FormFieldInsertion[] = this.renderer.fields().map((f, i) => {
      return {
        accept: f.accept,
        // 'alt': f.alt,
        autocomplete: toArrayOf(f.autocomplete),
        data: f.data as any,
        // 'description': f.description,
        form_id: this.form_id!,
        help_text: f.help_text,
        is_array: f.is_array || false,
        label: f.label,
        local_index: i,
        // 'max': f.max,
        // 'maxlength': f.maxlength,
        // 'min': f.min,
        // 'minlength': f.minlength,
        name: f.name,
        pattern: f.pattern,
        placeholder: f.placeholder,
        required: f.required,
        type: f.type,
      };
    });

    const _ = await this.client
      .from("form_field")
      .insert(rows)
      .select("name, id");

    // update fields_db_map
    _.data?.forEach((f) => {
      // TODO: consider using a better key
      this.fields_db_map[f.name] = f.id;
    });

    this.fields_db_map_ready = true;

    console.log(
      "json2db fields",
      this.renderer.fields(),
      _,
      this.fields_db_map
    );

    return _;
  }

  private async insert_options() {
    assert(!!this.form_id, "form not inserted");
    assert(!!this.fields_db_map_ready, "fields not inserted");

    const options = this.renderer
      .fields()
      .map((f) =>
        f.options?.map((o, i) => ({
          ...o,
          index: o.index || i,
          _field: f,
        }))
      )
      .flat()
      .filter((o) => !!o);

    const rows: FormFieldOptionInsertion[] = options.map((o) => {
      const form_field_id = this.fields_db_map[o!._field.name];
      return {
        form_id: this.form_id!,
        form_field_id: form_field_id,
        disabled: o!.disabled,
        index: o!.index,
        label: o!.label,
        src: o!.src,
        value: o!.value,
      };
    });

    return this.client.from("form_field_option").insert(rows);
  }

  private async insert_blocks() {
    assert(!!this.form_id, "form not inserted");
    assert(!!this.form_document_id, "page not inserted");

    // FIXME: block mapping is not complete - only works for field blocks and header blocks

    // @ts-ignore
    const rows: FormBlockInsertion[] = this.renderer.blocks().map((b, i) => {
      const __shared: Partial<FormBlockInsertion> = {
        // data: b.data
        form_id: this.form_id!,
        form_page_id: this.form_document_id!,
        local_index: b.local_index,
        parent_id: null, // TODO: need tree handling
        type: b.type,
      };
      switch (b.type) {
        case "field": {
          const form_field_id = this.fields_db_map[b.field.id];
          console.log("json2db field", b.field.id, form_field_id);
          return {
            ...__shared,
            form_field_id: form_field_id,
          };
        }
        case "header": {
          return {
            ...__shared,
            // TODO: needs rename
            title_html: b.title_html,
            description_html: b.description_html,
          };
        }
        default: {
          return __shared;
        }
      }
    });

    console.log("json2db blocks", rows);

    return await this.client.from("form_block").insert(rows);
  }

  async insert() {
    await this.insert_form();
    await this.insert_form_document();
    await this.insert_fields();
    await this.insert_options();
    await this.insert_blocks();

    return {
      form_id: this.form_id!,
      form_document_id: this.form_document_id!,
    };
  }
}
