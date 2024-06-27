import {
  SYSTEM_GF_KEY_STARTS_WITH,
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
  SYSTEM_GF_CUSTOMER_UUID_KEY,
} from "@/k/system";
// TODO: need RLS?
import { client, grida_commerce_client } from "@/lib/supabase/server";
import { upsert_customer_with } from "@/services/customer";
import {
  validate_max_access_by_customer,
  validate_max_access_by_form,
} from "@/services/form/validate-max-access";
import { NextRequest, NextResponse } from "next/server";
import { FormLinkURLParams, formerrorlink, formlink } from "@/lib/forms/url";
import * as ERR from "@/k/error";
import {
  FormFieldOptionsInventoryMap,
  form_field_options_inventory,
  validate_options_inventory,
} from "@/services/form/inventory";
import assert from "assert";
import { GridaCommerceClient } from "@/services/commerce";
import { OnSubmitProcessors, OnSubmit } from "./hooks";
import { Features } from "@/lib/features/scheduling";
import { IpInfo, ipinfo } from "@/lib/ipinfo";
import type {
  ConnectionSupabaseJoint,
  FormFieldStorageSchema,
  Geo,
} from "@/types";
import { PGXXError } from "@/k/errcode";
import { qval } from "@/utils/qs";
import { notFound } from "next/navigation";
import { FormSubmitErrorCode } from "@/types/private/api";
import { SessionMeta, meta } from "./meta";
import { sbconn_insert } from "./sbconn";
import { FieldSupports } from "@/k/supported_field_types";
import { UniqueFileNameGenerator } from "@/lib/forms/storage";
import {
  GRIDA_FORMS_RESPONSE_BUCKET,
  GRIDA_FORMS_RESPONSE_BUCKET_UPLOAD_LIMIT,
} from "@/k/env";
import type { InsertDto } from "@/types/supabase-ext";
import { parseGFKeys } from "@/lib/forms/gfkeys";
import {
  SessionStagedFileStorage,
  parse_tmp_storage_object_path,
} from "@/services/form/session-storage";
import { createXSupabaseClient } from "@/services/x-supabase";
import { FormValue } from "@/services/form";
import { XSupabase } from "@/services/x-supabase";
import { TemplateVariables } from "@/lib/templating";

const HOST = process.env.HOST || "http://localhost:3000";

export const revalidate = 0;

export async function GET(
  req: NextRequest,
  context: {
    params: { id: string };
  }
) {
  const form_id = context.params.id;

  // #region 1 prevalidate request form data (query)
  const __keys = Array.from(req.nextUrl.searchParams.keys());
  const system_gf_keys = __keys.filter((key) =>
    key.startsWith(SYSTEM_GF_KEY_STARTS_WITH)
  );
  const keys = __keys.filter((key) => !system_gf_keys.includes(key));

  if (!keys.length) {
    return NextResponse.json(
      { error: "You must submit form with query params" },
      { status: 400 }
    );
  }
  // #endregion
  const data = req.nextUrl.searchParams;
  return submit({
    data: data,
    form_id,
    meta: meta(req, data),
  });
}

export async function POST(
  req: NextRequest,
  context: {
    params: { id: string };
  }
) {
  const form_id = context.params.id;

  // #region 1 prevalidate request form data
  let data: FormData;
  try {
    data = await req.formData();
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "You must submit form with formdata attatched" },
      { status: 400 }
    );
  }
  // #endregion

  return submit({ data, form_id, meta: meta(req, data) });
}

async function submit({
  data,
  form_id,
  meta,
}: {
  form_id: string;
  data: FormData | URLSearchParams | Map<string, string>;
  meta: SessionMeta;
}) {
  // console.log("form_id", form_id);

  // check if form exists
  const { data: form_reference } = await client
    .from("form")
    .select(
      `
        *,
        fields:form_field(
          *,
          options:form_field_option(*)
        ),
        options:form_field_option(*),
        store_connection:connection_commerce_store(*),
        supabase_connection:connection_supabase(*)
      `
    )
    .eq("id", form_id)
    .single();

  if (!form_reference) {
    return error(404, { form_id }, meta);
  }

  const {
    project_id,
    fields,
    unknown_field_handling_strategy,
    is_redirect_after_response_uri_enabled,
    is_ending_page_enabled,
    ending_page_template_id,
    redirect_after_response_uri,
    is_force_closed,
    is_scheduling_enabled,
    is_max_form_responses_in_total_enabled,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_by_customer,
    scheduling_open_at,
    scheduling_close_at,
    store_connection,
    supabase_connection,
    options,
  } = form_reference;

  const entries = data.entries();

  const __keys_all = Array.from(data.keys());

  const system_keys = parseGFKeys(data);

  const nonsystem_keys = __keys_all.filter(
    (key) => !Object.keys(system_keys).includes(key)
  );

  // console.log("submit#meta", meta);

  // pre meta processing
  let ipinfo_data: IpInfo | null = isObjectEmpty(meta.geo)
    ? await fetchipinfo(meta.ip)
    : null;

  // customer handling

  const _gf_customer_uuid: string | null = qval(
    data.get(SYSTEM_GF_CUSTOMER_UUID_KEY) as string
  );

  const _fp_fingerprintjs_visitorid: string | null = data.get(
    SYSTEM_GF_FINGERPRINT_VISITORID_KEY
  ) as string;

  // console.log("/submit::_gf_customer_uuid:", _gf_customer_uuid);

  const customer = await upsert_customer_with({
    project_id: form_reference.project_id,
    uuid: _gf_customer_uuid,
    hints: {
      _fp_fingerprintjs_visitorid,
    },
  });

  // console.log("/submit::customer:", customer);

  // ==================================================
  // region access validation
  // ==================================================

  // access validation - check if form is force closed
  // (also checked in the db constraints)
  if (is_force_closed) {
    return error(ERR.FORM_CLOSED_WHILE_RESPONDING.code, { form_id }, meta);
  }

  // access validation - check if form is in schedule range
  // (also checked in the db constraints)
  if (is_scheduling_enabled) {
    const is_schedule_in_range = Features.schedule_in_range({
      open: scheduling_open_at,
      close: scheduling_close_at,
    });

    if (!is_schedule_in_range) {
      return error(ERR.FORM_SCHEDULE_NOT_IN_RANGE.code, { form_id }, meta);
    }
  }

  // access validation - check max response limit
  // (also checked in the db constraints)
  if (is_max_form_responses_in_total_enabled) {
    const max_response_error = await validate_max_access_by_form({ form_id });

    if (max_response_error) {
      switch (max_response_error.code) {
        case "FORM_RESPONSE_LIMIT_REACHED": {
          return error(ERR.FORM_RESPONSE_LIMIT_REACHED.code, { form_id }, meta);
        }
        default: {
          return error(500, { form_id }, meta);
        }
      }
    }
  }

  // access validation - check if new response is accepted for custoemer
  // note: per form validation is ready with db constraints.
  // TODO: this also needs to be migrated to db constraints
  const max_access_by_customer_error = await validate_max_access_by_customer({
    form_id,
    customer_id: customer?.uid,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_by_customer,
  });

  if (max_access_by_customer_error) {
    return error(max_access_by_customer_error.code, { form_id }, meta);
  }

  // endregion

  // ==================================================
  // data validation
  // ==================================================

  // validation - check if all value is present for required hidden fields
  const required_hidden_fields = fields.filter(
    (f) => f.type === "hidden" && f.required
  );

  const missing_required_hidden_fields = required_hidden_fields.filter((f) => {
    // TODO: to be more clear, rather than checking if the value is present, check if the value matches the required format, e.g. uuidv4 for __gf_customer_uuid
    return !(__keys_all.includes(f.name) && !!data.get(f.name));
  });

  if (missing_required_hidden_fields.length > 0) {
    console.error("error", ERR.MISSING_REQUIRED_HIDDEN_FIELDS);
    return error(
      ERR.MISSING_REQUIRED_HIDDEN_FIELDS.code,
      {
        form_id,
        keys: missing_required_hidden_fields.filter(Boolean).map((f) => f.name),
      },
      meta
    );
  }

  // endregion

  // ==================================================
  // region inventory
  // ==================================================

  // validatopn - check if user selected option is connected to inventory and is available
  let options_inventory: FormFieldOptionsInventoryMap | null = null;
  if (store_connection) {
    const commerce = new GridaCommerceClient(
      grida_commerce_client,
      project_id,
      store_connection.store_id
    );

    options_inventory = await form_field_options_inventory({
      project_id: project_id,
      store_id: store_connection.store_id,
    });
    const inventory_keys = Object.keys(options_inventory);

    // TODO: this may conflict the validation policy since v1/load uses render fields.
    const options = form_reference.fields.map((f) => f.options).flat();

    // TODO: now we only support one inventory option selection per form
    const data_present_option_fields = fields.filter((f) => {
      return f.options.length > 0 && !!data.get(f.name);
    });

    // get the option id that is both present in inventory and form data
    const possible_selection_option_ids = data_present_option_fields
      .map((f) => String(data.get(f!.name)))
      .filter((id) => inventory_keys.includes(id));

    assert(
      possible_selection_option_ids.length <= 1,
      "Multiple inventory options is not supported yet."
    );

    const selection_id =
      possible_selection_option_ids.length == 1
        ? possible_selection_option_ids[0]
        : null;

    console.log("selection_id", selection_id);

    // validate if inventory is present
    const inventory_access_error = await validate_options_inventory({
      inventory: options_inventory,
      options: options,
      selection: selection_id ? { id: selection_id } : undefined,
      config: {
        available_counting_strategy: "sum_positive",
      },
    });
    if (inventory_access_error) {
      console.error(inventory_access_error);
      return error(inventory_access_error.code, { form_id }, meta);
    }

    if (selection_id) {
      // THIS CAN FAIL / MALFORM THE DATA ON HIGH CONCURRENCY
      // when:
      // - 0. this can malform the inventory data since this does not has a roll-back mechanism - when
      //    - 1. prevalidation success
      //    - 2. inventory validation success
      //    - 3. form response insertion fails
      // - 1. when near scheduling_close_at - when very close to the close time, the inventory can be malform since the time was valid at the prevalidation time, but not valid at the response insertion time.
      // - 2. when near max_response_by_customer - when customer has multiple windows open and submitting the form at the same time. (but has to be almost at the same time)
      // - 3. when sum of inventory is higher than max_response_in_total - this can cause sum of committed inventory being higher than the max_response_in_total
      // SOLUTION:
      // - rollback mechanism
      // - linked transaction
      // QUESTIONS:
      // - will having a queue help?
      // - will having a rpc (isolated) help?
      // - will rollback mechanism be enough?

      // TODO: only supports single inventory option selection
      // TODO: this needs to be done via RPC - first we will need a relation between response field and inventory item
      // update the inventory as selected
      const { error: inventory_error } = await commerce.upsertInventoryItem({
        sku: selection_id,
        level: {
          diff: -1,
          reason: "order",
        },
      });

      if (inventory_error) {
        switch (inventory_error.code) {
          case PGXXError.XX320: {
            return error(ERR.FORM_OPTION_UNAVAILABLE.code, { form_id }, meta);
          }
          default: {
            console.error("submit/err/inventory", inventory_error);
            return error(500, { form_id }, meta);
          }
        }
      }
    }
  }

  // endregion

  // ==================================================
  // region user supabase connection

  let RECORD: any = undefined;
  if (supabase_connection && supabase_connection.main_supabase_table_id) {
    try {
      const insertion = await sbconn_insert({
        connection: supabase_connection,
        formdata: data,
        enums: options,
      });

      console.log("sbconn_insertion", insertion);

      const { data: sbconn_inserted, error: sbconn_insertion_error } =
        insertion;

      if (sbconn_insertion_error) {
        console.error("submit/err/sbconn", sbconn_insertion_error);
        // TODO: use 400 - developer error with error info
        return error(500, { form_id }, meta);
      }

      RECORD = sbconn_inserted;
    } catch (e) {
      console.error("submit/err/sbconn", e);
      // TODO: enhance error message
      return error(500, { form_id }, meta);
    }
  }

  // create new form response
  const { data: response_reference_obj, error: response_insertion_error } =
    await client
      .from("response")
      .insert({
        raw: FormValue.safejson(Object.fromEntries(entries)),
        form_id: form_id,
        session_id: meta.session,
        browser: meta.browser,
        ip: meta.ip,
        customer_id: customer?.uid,
        x_referer: meta.referer,
        x_useragent: meta.useragent,
        x_ipinfo: ipinfo_data as {},
        geo: isObjectEmpty(meta.geo)
          ? ipinfo_data
            ? ipinfogeo(ipinfo_data)
            : undefined
          : (meta.geo as {}),
        platform_powered_by: meta.platform_powered_by,
      })
      .select("id")
      .single();

  if (response_insertion_error) {
    console.info("submit/rejected", response_insertion_error);

    switch (response_insertion_error.code) {
      // force close
      case PGXXError.XX211: {
        // form is force closed
        return error(ERR.FORM_FORCE_CLOSED.code, { form_id }, meta);
      }
      // max response (per form)
      case PGXXError.XX221: {
        // max response limit reached
        return error(ERR.FORM_RESPONSE_LIMIT_REACHED.code, { form_id }, meta);
      }
      // max response (per customer)
      case PGXXError.XX222: {
        // max response limit reached for this customer
        return error(
          ERR.FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED.code,
          {
            form_id,
            ...({
              fingerprint: _fp_fingerprintjs_visitorid,
              customer_id: customer?.uid,
              session_id: meta.session || undefined,
            } satisfies FormLinkURLParams["alreadyresponded"]),
          },
          meta
        );
      }
      // scheduling
      case PGXXError.XX230: /* out of range */
      case PGXXError.XX231: /* closed */
      case PGXXError.XX232 /* not open yet */: {
        // form is closed by scheduler
        return error(ERR.FORM_SCHEDULE_NOT_IN_RANGE.code, { form_id }, meta);
      }
      default: {
        // server error
        console.error("submit/err", 500, response_insertion_error);
        return error(500, { form_id }, meta);
      }
    }
  }

  // get the fields ready

  // group by existing and new fields
  const v_form_fields = fields.slice();
  const known_names = nonsystem_keys.filter((key) => {
    return v_form_fields!.some((field: any) => field.name === key);
  });

  const unknown_names = nonsystem_keys.filter((key) => {
    return !v_form_fields!.some((field: any) => field.name === key);
  });
  const ignored_names: string[] = [];
  const target_names: string[] = [];
  let needs_to_be_created: string[] | null = null;

  // create new fields by preference
  if (
    unknown_field_handling_strategy === "ignore" &&
    unknown_names.length > 0
  ) {
    // ignore new fields
    ignored_names.push(...unknown_names);
    // add only existing fields to mapping
    target_names.push(...known_names);
  } else {
    // add all fields to mapping
    target_names.push(...known_names);
    target_names.push(...unknown_names);

    if (unknown_field_handling_strategy === "accept") {
      needs_to_be_created = [...unknown_names];
    } else if (unknown_field_handling_strategy === "reject") {
      if (unknown_names.length > 0) {
        // reject all fields
        return error(
          ERR.UNKNOWN_FIELDS_NOT_ALLOWED.code,
          {
            form_id,
            keys: unknown_names,
          },
          meta
        );
      }
    }
  }

  if (needs_to_be_created) {
    // create new fields
    const { data: new_fields } = await client
      .from("form_field")
      .insert(
        needs_to_be_created.map((key) => ({
          form_id: form_id,
          name: key,
          type: "text" as const,
          description: "Automatically created",
        }))
      )
      .select("*");

    // extend form_fields with new fields (match the type)
    v_form_fields!.push(...new_fields?.map((f) => ({ ...f, options: [] }))!);
  }

  const field_file_uploads: Record<
    string,
    Promise<SupabaseStorageUploadReturnType[]>
  > = {};

  // save each field value
  const { error: v_fields_error } = await client.from("response_field").insert(
    v_form_fields!.map((field) => {
      const { type, name, options } = field;

      // the field's value can be a input value or a reference to form_field_option
      const value_or_reference = data.get(name);
      const { value, enum_id } = FormValue.parse(value_or_reference, {
        enums: options,
      });

      // handle file uploads
      if (FieldSupports.file_alias(type)) {
        const files = (data as FormData).getAll(name);

        console.log("submit/file", files);

        field_file_uploads[field.id] = process_response_field_files(
          files,
          {
            session_id: meta.session || undefined,
            response_id: response_reference_obj!.id,
            field_id: field.id,
          },
          {
            storage: field.storage as FormFieldStorageSchema | null,
            supabase: supabase_connection,
            // @ts-ignore // TODO: provide all context - currently this is only used for x-supabase storage
            context: {
              NEW: RECORD,
              RECORD: RECORD,
            },
          }
        );
      }

      return {
        type: type,
        response_id: response_reference_obj!.id,
        form_field_id: field.id,
        form_id: form_id,
        // TODO: save value with schema type accordinglly
        value: JSON.stringify(value),
        form_field_option_id: enum_id,
      };
    })
  );

  if (v_fields_error) console.error("submit/err/fields", v_fields_error);

  // ==================================================
  // post-upload processing
  // ==================================================

  // update fields with file uploads
  const awaited_uploads = (
    await Promise.all(Object.values(field_file_uploads))
  ).flat();

  const uploads_errors = awaited_uploads
    .map((result) => (result.error ? result.error : null))
    .filter(Boolean);

  if (uploads_errors.length > 0) {
    console.error("submit/err/file_uploads", uploads_errors);
  }

  const field_file_upload_results: Record<
    string,
    SupabaseStorageUploadReturnType[]
  > = {};

  for (const [field_id, results] of Object.entries(field_file_uploads)) {
    // although already resolved
    field_file_upload_results[field_id] = await results;
  }

  const file_upserts = Object.keys(field_file_uploads).map((field_id, i) => {
    const success_results = field_file_upload_results[field_id].filter(
      (res) => !!res.data
    );

    const uploadedfileval = success_results.map((res) => {
      const filename = res.data!.path.split("/").pop();
      return filename;
    }) as string[];

    const upsertion: InsertDto<"response_field"> = {
      form_field_id: field_id,
      response_id: response_reference_obj!.id,
      form_id: form_id,
      value: FormValue.encode(uploadedfileval),
      storage_object_paths: success_results.map(
        (res) => res.data!.path
      ) as string[],
    };
    return upsertion;
  });

  if (file_upserts.length > 0) {
    const { error: file_upload_upsertion_error } = await client
      .from("response_field")
      .upsert(file_upserts, {
        onConflict: "response_id, form_field_id",
      });
    if (file_upload_upsertion_error) {
      console.error(
        "submit/err/file_upload_upsertion",
        file_upload_upsertion_error
      );
    }

    // notify response change with updating updated_at
    await client
      .from("response")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", response_reference_obj!.id);
  }

  // endregion

  // ==================================================
  // region complete hooks
  // ==================================================

  // system hooks
  if (meta.session) {
    try {
      OnSubmit.clearsession({
        form_id,
        response_id: response_reference_obj.id,
        session_id: meta.session,
      });
    } catch (e) {
      console.error("submit/err/hooks/clearsession", e);
    }
  }

  try {
    OnSubmit.postindexing({
      form_id,
      response_id: response_reference_obj.id,
    });
  } catch (e) {
    console.error("submit/err/hooks/postindexing", e);
  }

  // notification hooks are not ready yet
  // try {
  //   await hook_notifications({ form_id });
  // } catch (e) {
  //   console.error("submit/err/hooks", e);
  // }

  // endregion

  // ==================================================
  // region final response
  // ==================================================

  switch (meta.accept) {
    case "application/json": {
      // ==================================================
      // region response building
      // ==================================================

      // build info
      let info: any = {};

      // if there are new fields
      if (needs_to_be_created?.length) {
        info.new_keys = {
          message:
            "There were new unknown fields in the request and the definitions are created automatically. To disable them, set 'unknown_field_handling_strategy' to 'ignore' or 'reject' in the form settings.",
          data: {
            keys: needs_to_be_created,
            fields: v_form_fields!.filter((field: any) =>
              needs_to_be_created!.includes(field.name)
            ),
          },
        };
      }

      // build warning
      let warning: any = {};

      // if there are ignored fields
      if (ignored_names.length > 0) {
        warning.ignored_keys = {
          message:
            "There were unknown fields in the request. To allow them, set 'unknown_field_handling_strategy' to 'accept' in the form settings.",
          data: { keys: ignored_names },
        };
      }

      // endregion

      // finally fetch the response for pingback
      const { data: response, error: select_response_error } = await client
        .from("response")
        .select(
          `
        *,
        response_field (
          *
        )
      `
        )
        .eq("id", response_reference_obj!.id)
        .single();

      if (select_response_error) console.error(select_response_error);

      return NextResponse.json({
        data: response,
        raw: response?.raw,
        warning: Object.keys(warning).length > 0 ? warning : null,
        info: Object.keys(info).length > 0 ? info : null,
        error: null,
      });
    }
    case "text/html": {
      if (is_ending_page_enabled && ending_page_template_id) {
        return NextResponse.redirect(
          formlink(HOST, form_id, "complete", {
            rid: response_reference_obj.id,
          }),
          {
            status: 301,
          }
        );
      }

      if (
        is_redirect_after_response_uri_enabled &&
        redirect_after_response_uri
      ) {
        return NextResponse.redirect(redirect_after_response_uri, {
          status: 301,
        });
      }

      return NextResponse.redirect(
        formlink(HOST, form_id, "complete", {
          rid: response_reference_obj.id,
        }),
        {
          status: 301,
        }
      );
    }
  }

  // endregion
}

type SupabaseStorageUploadReturnType =
  | {
      data: { path: string };
      error: null;
    }
  | {
      data: null;
      error: any;
    };

// region file upload

/**
 * Handles the uploading of response files, ensuring that each file has a unique name within its path.
 *
 * @param pathparams - An object containing the response ID and field ID.
 * @param files - An array of FormDataEntryValue containing the files to be uploaded.
 * @returns A promise that resolves when all file uploads are complete.
 *
 * TODO: this should return a error info
 */
async function process_response_field_files(
  files: FormDataEntryValue[],
  pathparams: {
    session_id?: string;
    response_id: string;
    field_id: string;
  },
  connections?: {
    supabase: ConnectionSupabaseJoint | null;
    storage: FormFieldStorageSchema | null;
    context: TemplateVariables.ConnectedDatasourcePostgresTransactionCompleteContext;
  }
) {
  const uploads: Promise<SupabaseStorageUploadReturnType>[] = [];
  const { response_id, field_id, session_id } = pathparams;
  const basepath = `response/${response_id}/${field_id}/`;

  const uniqueFileNameGenerator = new UniqueFileNameGenerator();

  for (const file of files) {
    if (file instanceof File) {
      if (
        file.size == 0 ||
        file.size > GRIDA_FORMS_RESPONSE_BUCKET_UPLOAD_LIMIT
      ) {
        // silently ignore the file
        console.warn(
          `File '${file.name}' (${file.size} bytes) size is 0 or exceeds the upload limit. (limit: ${GRIDA_FORMS_RESPONSE_BUCKET_UPLOAD_LIMIT} bytes)`
        );
      } else {
        const uniqueFileName = uniqueFileNameGenerator.name(file.name);
        const path = basepath + uniqueFileName;

        const upload = client.storage
          .from(GRIDA_FORMS_RESPONSE_BUCKET)
          .upload(path, file);
        uploads.push(upload);
      }
    } else {
      // if not file, it means it is already uploaded on client side with session, it needs to be moved to response folder.
      // from : {bucket}/tmp/{session_id}/{field_id}/{i}
      // to: {bucket}/response/{response_id}/{field_id}/{i}

      const pl = String(file);

      if (!pl) continue; // empty string

      // when file input is uploaded and includes the path, the input will have a value of path[], which on formdata, it will be a comma separated string
      for (const tmppath of pl.split(",")) {
        try {
          const _p = parse_tmp_storage_object_path(tmppath);

          assert(
            _p.session_id === session_id,
            `session_id mismatch. expected: ${session_id}, got: ${_p.session_id}`
          );

          if (connections?.storage) {
            try {
              const { type, mode, bucket, path } = connections.storage;

              switch (type) {
                case "x-supabase": {
                  assert(mode === "staged", "mode must be staged");
                  assert(connections.supabase, "supabase_connection not found");
                  const client = await createXSupabaseClient(
                    connections.supabase.supabase_project_id,
                    {
                      service_role: true,
                    }
                  );

                  const renderedpath = XSupabase.Storage.renderpath(
                    path,
                    connections.context
                  );
                  // const renderedpath = render(path, connections.context);
                  const storage = new SessionStagedFileStorage(client, bucket);
                  const { error } = await storage.resolveStagedFile(
                    tmppath,
                    renderedpath
                  );
                  if (error) {
                    console.error("submit/err/tmp-mv", tmppath, error);
                    continue;
                  }
                  uploads.push(
                    Promise.resolve({
                      data: { path: renderedpath },
                      error: null,
                    })
                  );
                  break;
                }
                case "grida":
                case "x-s3":
                default:
                  throw new Error("storage type not supported");
              }
            } catch (e) {
              console.error("submit/err/storageconn", e);
              continue;
            }
          } else {
            // default grida forms behavior
            const targetpath = basepath + _p.name;
            const storage = new SessionStagedFileStorage(
              client,
              GRIDA_FORMS_RESPONSE_BUCKET
            );

            const { error } = await storage.resolveStagedFile(
              tmppath,
              targetpath
            );

            if (error) {
              console.error("submit/err/tmp-mv", tmppath, error);
              continue;
            }

            // push the result (mocked)
            uploads.push(
              Promise.resolve({
                data: { path: targetpath },
                error: null,
              })
            );
          }
        } catch (e) {
          console.log("submit/err/unknown-file", file);
          console.error("submit/err/tmp-path-parse", e);
          continue;
        }
      }
    }
  }

  // TODO: need to handle the case where file size exceeds the limit
  return Promise.all(uploads);
}

// endregion

function error(
  code:
    | 404
    | 400
    | 500
    //
    | FormSubmitErrorCode,

  data: {
    form_id: string;
    [key: string]: any;
  },
  meta: {
    accept: "application/json" | "text/html";
  }
) {
  const { form_id } = data;

  const useredirect = meta.accept === "text/html";

  if (useredirect) {
    switch (code) {
      case 404: {
        return notFound();
      }
      case 400: {
        return NextResponse.redirect(formlink(HOST, form_id, "badrequest"), {
          status: 301,
        });
      }
      case 500: {
        return NextResponse.redirect(formlink(HOST, form_id, "badrequest"), {
          status: 301,
        });
      }
      case "INTERNAL_SERVER_ERROR":
      case "MISSING_REQUIRED_HIDDEN_FIELDS":
      case "UNKNOWN_FIELDS_NOT_ALLOWED":
      case "FORM_FORCE_CLOSED":
      case "FORM_CLOSED_WHILE_RESPONDING":
      case "FORM_RESPONSE_LIMIT_REACHED":
      case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
      case "FORM_SCHEDULE_NOT_IN_RANGE":
      case "FORM_SOLD_OUT":
      case "FORM_OPTION_UNAVAILABLE": {
        return NextResponse.redirect(formerrorlink(HOST, code, data), {
          status: 301,
        });
      }
    }
  } else {
    let data: any = null;
    switch (code) {
      case 404: {
        return NextResponse.json({ error: "Form not found" }, { status: 404 });
      }
      case 400: {
        return NextResponse.json({ error: "Bad Request" }, { status: 400 });
      }
      case "INTERNAL_SERVER_ERROR":
      case 500: {
        return NextResponse.json(
          { error: "Internal Server Error" },
          { status: 500 }
        );
      }
      case "MISSING_REQUIRED_HIDDEN_FIELDS":
      case "UNKNOWN_FIELDS_NOT_ALLOWED": {
        return NextResponse.json(
          {
            error: code,
            message: ERR[code].message,
            info: data,
          },
          { status: 400 }
        );
      }
      case "FORM_FORCE_CLOSED":
      case "FORM_CLOSED_WHILE_RESPONDING":
      case "FORM_RESPONSE_LIMIT_REACHED":
      case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
      case "FORM_SCHEDULE_NOT_IN_RANGE":
      case "FORM_SOLD_OUT":
      case "FORM_OPTION_UNAVAILABLE":
      default: {
        return NextResponse.json(
          {
            error: code,
            message: ERR[code].message,
            info: data,
          },
          { status: 403 }
        );
      }
    }
  }

  //
}

async function hook_notifications({ form_id }: { form_id: string }) {
  // FIXME: DEV MODE

  // [emails]

  const business_profile = {
    name: "Grida Forms",
    email: "no-reply@cors.sh",
  };

  await OnSubmitProcessors.send_email({
    form_id: form_id,
    type: "formcomplete",
    from: {
      name: business_profile.name,
      email: business_profile.email,
    },
    to: "universe@grida.co",
    lang: "en",
  });

  // [sms]

  await OnSubmitProcessors.send_sms({
    form_id: form_id,
    type: "formcomplete",
    to: "...",
    lang: "en",
  });
}

function isObjectEmpty(obj: object | null | undefined) {
  try {
    // @ts-ignore
    return Object.keys(obj).length === 0;
  } catch (e) {
    return true;
  }
}

function ipinfogeo(ipinfo: IpInfo): Geo | null {
  if (!ipinfo) return null;
  if (ipinfo.loc) {
    const [lat, long] = ipinfo.loc.split(",");
    return {
      city: ipinfo.city,
      country: ipinfo.country,
      region: ipinfo.region,
      latitude: lat,
      longitude: long,
    };
  }

  return {
    city: ipinfo.city,
    country: ipinfo.country,
    region: ipinfo.region,
  };
}

async function fetchipinfo(ip?: string | null) {
  if (!ip) return null;
  try {
    return await ipinfo(ip, process.env.IPINFO_ACCESS_TOKEN);
  } catch (e) {
    console.error(e);
    return null;
  }
}
