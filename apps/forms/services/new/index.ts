import { grida_forms_client, workspaceclient } from "@/supabase/server";
import type {
  FormResponseUnknownFieldHandlingStrategyType,
  GDocumentType,
} from "@/types";
import assert from "assert";
import {
  isValidSchemaName,
  schemaname_validation_messages,
} from "../utils/regex";

/**
 * NO RLS - use with caution
 */
class DocumentSetupAssistantService {
  constructor(
    readonly project_id: number,
    private readonly doctype: GDocumentType
  ) {}

  document_id: string | null = null;
  protected async createMasterDocument({ title }: { title?: string }) {
    if (this.document_id) throw new Error("document already created");
    const { data: document_ref, error: doc_ref_err } = await workspaceclient
      .from("document")
      .insert({
        title: title,
        project_id: this.project_id,
        doctype: this.doctype,
      })
      .select()
      .single();

    if (doc_ref_err) {
      console.error(doc_ref_err);
      throw doc_ref_err;
    }

    assert(document_ref, "document not created");

    this.document_id = document_ref.id;
    return document_ref;
  }

  protected async rollback() {
    try {
      if (!this.document_id) return;

      await workspaceclient
        .from("document")
        .delete()
        .eq("id", this.document_id);
    } catch (e) {
      console.error(e);
    }
  }
}

export class SchemaDocumentSetupAssistantService extends DocumentSetupAssistantService {
  constructor(
    readonly project_id: number,
    private readonly seed: { name: string }
  ) {
    super(project_id, "v0_schema");
  }

  private async validateName(): Promise<true | "taken" | "invalid"> {
    if (!isValidSchemaName(this.seed.name)) {
      return "invalid";
    }

    // check for duplicate
    const { error, count } = await grida_forms_client
      .from("schema_document")
      .select("id", { count: "exact" })
      .eq("name", this.seed.name)
      .eq("project_id", this.project_id);

    if (error) {
      console.error(error);
      throw error;
    }

    if (count === null) {
      throw new Error("Unexpected error");
    }

    if (count > 0) {
      return "taken";
    }

    return true;
  }

  async createSchemaDocument() {
    const { name } = this.seed;

    // pre-validation
    const isvalidname = await this.validateName();
    if (isvalidname !== true) {
      if (isvalidname === "taken") {
        throw new Error("Schema name already exists");
      } else {
        throw new Error(schemaname_validation_messages.invalid);
      }
    }

    const masterdoc_ref = await this.createMasterDocument({
      title: name,
    });

    const { data, error } = await grida_forms_client
      .from("schema_document")
      .insert({
        id: masterdoc_ref.id,
        name: name,
        project_id: this.project_id,
      })
      .select()
      .single();

    if (error) {
      await this.rollback();
      if (error.code === "23505") {
        throw new Error("Schema name already exists");
      }
      console.error(error);
      throw error;
    }

    return data;
  }
}

export class SiteDocumentSetupAssistantService extends DocumentSetupAssistantService {
  constructor(
    readonly project_id: number,
    private readonly seed: Partial<{ title: string }>
  ) {
    super(project_id, "v0_site");
  }

  async createSiteDocument() {
    return this.createMasterDocument({
      title: this.seed.title ?? "Untitled Site",
    });
  }
}

/**
 * NO RLS - use with caution
 */
export class FormDocumentSetupAssistantService extends DocumentSetupAssistantService {
  constructor(
    readonly project_id: number,
    private readonly seed: Partial<{
      description?: string | null;
      title?: string;
      table_name?: string;
      unknown_field_handling_strategy?: FormResponseUnknownFieldHandlingStrategyType;
    }> = {}
  ) {
    super(project_id, "v0_form");
  }

  private form_id: string | null = null;
  private async createFormDatabase() {
    if (this.form_id) return this.form_id;

    const { data: form, error } = await grida_forms_client
      .from("form")
      .insert({
        project_id: this.project_id,
        name: to_form_response_table_name(
          this.seed.table_name ?? this.seed.title ?? "untitled"
        ),
        description: this.seed.description,
        unknown_field_handling_strategy:
          this.seed.unknown_field_handling_strategy,
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);
      throw error;
    }

    if (!form) {
      console.error("form not created");
      throw error;
    }

    this.form_id = form.id;
    return this.form_id;
  }

  //
  async createFormDocument() {
    // create document
    const document_ref = await this.createMasterDocument({
      title: this.seed.title,
    });

    await this.createFormDatabase();
    assert(this.form_id, "form not created");

    // create a form document
    const { data: form_document, error: form_doc_err } =
      await grida_forms_client
        .from("form_document")
        .insert({
          id: document_ref.id,
          form_id: this.form_id,
          project_id: this.project_id,
        })
        .select("id")
        .single();

    if (form_doc_err) {
      console.error(form_doc_err);
      throw form_doc_err;
    }

    // link the page to the form
    await grida_forms_client
      .from("form")
      .update({
        default_form_page_id: form_document!.id,
      })
      .eq("id", this.form_id);

    return {
      form_id: this.form_id,
      form_document_id: form_document!.id,
    };
  }

  async seedFormDocumentBlocks() {
    return await seed_form_document_blocks({
      form_id: this.form_id!,
      form_document_id: this.document_id!,
    });
  }
}

async function seed_form_document_blocks({
  form_id,
  form_document_id,
}: {
  form_id: string;
  form_document_id: string;
}) {
  // default template blocks
  // 1. section
  // - header block
  // - field block

  const { data: section_block, error } = await grida_forms_client
    .from("form_block")
    .insert({
      type: "section",
      form_id,
      form_page_id: form_document_id,
      local_index: 0,
    })
    .select("id")
    .single();

  if (error) throw error;

  const section_1_id = section_block!.id;

  await grida_forms_client.from("form_block").insert([
    {
      type: "header",
      form_id,
      form_page_id: form_document_id,
      parent_id: section_1_id,
      title_html: "Untitled Section",
      local_index: 0,
    },
    {
      type: "field",
      form_id,
      form_page_id: form_document_id,
      parent_id: section_1_id,
      local_index: 0,
    },
  ]);
}

/**
 *
 * convert title to a table name
 *
 * @param title user input title
 * @returns
 */
function to_form_response_table_name(title: string) {
  return `form_response_${to_table_name(title)}`;
}

/**
 * Converts user input text to a valid Postgres compatible table name.
 * - no spaces (replaced with underscores)
 * - no special characters (except underscores)
 * - non-ASCII characters are allowed
 * @param txt
 * @returns string
 */
function to_table_name(txt: string): string {
  return txt
    .replace(/\s/g, "_") // Replace spaces with underscores
    .replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF]/g, "") // Remove special characters except underscores and keep non-ASCII
    .toLowerCase(); // Convert to lowercase
}
